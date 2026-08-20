/**
 * Scritture nel repo direttamente dal browser, via API GitHub.
 *
 * È l'unica scrittura che l'app fa in autonomia (le annotazioni 730): l'import
 * delle spese resta nella sessione mensile. Serve un token fine-grained con
 * permesso `Contents: read and write` sul solo repo di Margine, salvato in
 * localStorage — quindi per dispositivo, mai nel repo.
 */

import type { GithubConfig } from '../domain/types'
import { fromBase64 } from './envelope'

const API = 'https://api.github.com'
const TOKEN_KEY = 'margine.gh.token.v1'

export class GithubError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'GithubError'
  }
}

export function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token.trim())
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

function apiHeaders(token: string, accept = 'application/vnd.github+json'): HeadersInit {
  return {
    Accept: accept,
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function repoUrl(cfg: GithubConfig): string {
  return `${API}/repos/${cfg.owner}/${cfg.repo}`
}

function contentsUrl(cfg: GithubConfig, path: string = cfg.dataPath): string {
  return `${repoUrl(cfg)}/contents/${path}`
}

async function failure(response: Response): Promise<GithubError> {
  let detail = response.statusText
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'message' in body) {
      detail = String((body as { message: unknown }).message)
    }
  } catch {
    // corpo non JSON: ci basta lo statusText
  }
  return new GithubError(response.status, humanize(response.status, detail))
}

function humanize(status: number, detail: string): string {
  switch (status) {
    case 401:
      return 'Token GitHub non valido o scaduto: rigeneralo dalle impostazioni.'
    case 403:
      return `Permesso negato dal token (serve «Contents: read and write»). ${detail}`
    case 404:
      return 'Repo, branch o percorso del file non trovato: controlla la configurazione.'
    case 409:
    case 422:
      return 'Il file è stato modificato da un altro dispositivo: riprovo unendo le modifiche.'
    default:
      return `GitHub ha risposto ${status}: ${detail}`
  }
}

export interface RemoteFile {
  sha: string
  text: string
}

/** Legge un file dal repo. `null` se non esiste ancora. */
export async function getFile(
  cfg: GithubConfig,
  token: string,
  path: string = cfg.dataPath,
): Promise<RemoteFile | null> {
  const url = `${contentsUrl(cfg, path)}?ref=${encodeURIComponent(cfg.branch)}`
  const response = await fetch(url, { headers: apiHeaders(token), cache: 'no-store' })
  if (response.status === 404) return null
  if (!response.ok) throw await failure(response)

  const body = (await response.json()) as { sha?: string; content?: string; encoding?: string }
  if (typeof body.sha !== 'string') throw new GithubError(500, 'Risposta GitHub senza sha del file.')

  // Oltre 1 MB l'API non include il contenuto: va richiesto in raw.
  if (typeof body.content === 'string' && body.content.length > 0 && body.encoding === 'base64') {
    return { sha: body.sha, text: new TextDecoder().decode(fromBase64(body.content)) }
  }

  const raw = await fetch(url, {
    headers: apiHeaders(token, 'application/vnd.github.raw'),
    cache: 'no-store',
  })
  if (!raw.ok) throw await failure(raw)
  return { sha: body.sha, text: await raw.text() }
}

// ─────────────────────── più file, un commit solo ───────────────────────

/**
 * Scrive più file in **un commit unico**, con la Git Data API.
 *
 * La Contents API scrive un file per chiamata, quindi due file sono due commit —
 * e fra i due c'è un istante in cui il repo è incoerente con sé stesso. Non è
 * teoria: cancellare una categoria cambia insieme `config.json.enc` (la
 * categoria non c'è più) ed `expenses.json.enc` (le trenta spese sono state
 * spostate), e chi scarica l'app in quell'istante vede spese che puntano a una
 * categoria inesistente, o una categoria svuotata che invece ha ancora le sue
 * spese. Con quattro chiamate in più il commit è uno e quell'istante non esiste.
 * → ADR-0025
 *
 * Il verso opposto — un file solo — passa da qui ugualmente: due strade per
 * scrivere sarebbero due comportamenti da tenere allineati.
 */
export async function commitFiles(
  cfg: GithubConfig,
  token: string,
  args: { files: readonly { path: string; text: string }[]; message: string },
): Promise<{ sha: string }> {
  if (args.files.length === 0) throw new GithubError(400, 'Nessun file da scrivere.')

  const json = { ...apiHeaders(token), 'Content-Type': 'application/json' }
  const post = async <T>(path: string, body: unknown): Promise<T> => {
    const response = await fetch(`${repoUrl(cfg)}${path}`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify(body),
    })
    if (!response.ok) throw await failure(response)
    return (await response.json()) as T
  }

  const refPath = `/git/ref/heads/${encodeURIComponent(cfg.branch)}`
  const refResponse = await fetch(`${repoUrl(cfg)}${refPath}`, {
    headers: apiHeaders(token),
    cache: 'no-store',
  })
  if (!refResponse.ok) throw await failure(refResponse)
  const ref = (await refResponse.json()) as { object?: { sha?: string } }
  const head = ref.object?.sha
  if (!head) throw new GithubError(500, `Il branch ${cfg.branch} non ha una testa leggibile.`)

  const blobs = await Promise.all(
    args.files.map((file) =>
      post<{ sha: string }>('/git/blobs', { content: file.text, encoding: 'utf-8' }),
    ),
  )

  const tree = await post<{ sha: string }>('/git/trees', {
    base_tree: head,
    tree: args.files.map((file, index) => ({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blobs[index]?.sha,
    })),
  })

  const commit = await post<{ sha: string }>('/git/commits', {
    message: args.message,
    tree: tree.sha,
    parents: [head],
  })

  /*
   * `force: false`: se un altro dispositivo ha committato mentre lavoravamo, il
   * ref non è più un avanzamento del nostro padre e GitHub rifiuta con 422. È lo
   * stesso rilevamento di conflitto dello `sha` della Contents API, e chi chiama
   * lo tratta allo stesso modo — rilegge e riprova.
   */
  const update = await fetch(`${repoUrl(cfg)}/git/refs/heads/${encodeURIComponent(cfg.branch)}`, {
    method: 'PATCH',
    headers: json,
    body: JSON.stringify({ sha: commit.sha, force: false }),
  })
  if (!update.ok) throw await failure(update)
  return { sha: commit.sha }
}

export interface AccessCheck {
  ok: boolean
  message: string
}

/** Verifica dalle impostazioni che il token veda il file e possa scrivere. */
export async function testAccess(cfg: GithubConfig, token: string): Promise<AccessCheck> {
  try {
    const file = await getFile(cfg, token)
    if (!file) {
      return {
        ok: false,
        message: `Il token funziona, ma «${cfg.dataPath}» non esiste sul branch ${cfg.branch}.`,
      }
    }
    return { ok: true, message: `Accesso in lettura confermato su ${cfg.owner}/${cfg.repo}.` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Errore sconosciuto.' }
  }
}
