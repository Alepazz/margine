/**
 * Scritture nel repo direttamente dal browser, via API GitHub.
 *
 * È l'unica scrittura che l'app fa in autonomia (le annotazioni 730): l'import
 * delle spese resta nella sessione mensile. Serve un token fine-grained con
 * permesso `Contents: read and write` sul solo repo di Margine, salvato in
 * localStorage — quindi per dispositivo, mai nel repo.
 */

import type { GithubConfig } from '../domain/types'
import { fromBase64, toBase64 } from './envelope'

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

function contentsUrl(cfg: GithubConfig): string {
  return `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.dataPath}`
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

/** Legge il file dal repo. `null` se non esiste ancora. */
export async function getFile(cfg: GithubConfig, token: string): Promise<RemoteFile | null> {
  const url = `${contentsUrl(cfg)}?ref=${encodeURIComponent(cfg.branch)}`
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

export async function putFile(
  cfg: GithubConfig,
  token: string,
  args: { text: string; sha: string | null; message: string },
): Promise<{ sha: string }> {
  const response = await fetch(contentsUrl(cfg), {
    method: 'PUT',
    headers: { ...apiHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: args.message,
      content: toBase64(new TextEncoder().encode(args.text)),
      branch: cfg.branch,
      ...(args.sha ? { sha: args.sha } : {}),
    }),
  })
  if (!response.ok) throw await failure(response)
  const body = (await response.json()) as { content?: { sha?: string } }
  return { sha: body.content?.sha ?? '' }
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
