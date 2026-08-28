/**
 * Scritture nel repo direttamente dal browser, via API GitHub.
 *
 * È l'unica scrittura che l'app fa in autonomia (le annotazioni 730): l'import
 * delle spese resta nella sessione mensile. Il token vive in localStorage —
 * quindi per dispositivo, mai nel repo — e il suo tipo dipende da chi lo crea:
 * fine-grained con `Contents: read and write` per chi possiede il repo, classic
 * con `public_repo` per chi vi accede come collaboratore, perché un token
 * fine-grained non può scrivere su un repo di un altro account. → ADR-0040
 */

import type { RawCommit } from '../domain/changes'
import type { GithubConfig } from '../domain/types'
import { fromBase64 } from './envelope'

const API = 'https://api.github.com'
const TOKEN_KEY = 'margine.gh.token.v1'
/* Il login dell'account del token: serve solo a riconoscere i propri commit. */
const LOGIN_KEY = 'margine.gh.login.v1'

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

export function loadLogin(): string | null {
  try {
    return localStorage.getItem(LOGIN_KEY)
  } catch {
    return null
  }
}

export function saveLogin(login: string): void {
  try {
    localStorage.setItem(LOGIN_KEY, login)
  } catch {
    /* senza storage si riconoscono meno bene i propri commit, non è grave */
  }
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  try {
    localStorage.removeItem(LOGIN_KEY)
  } catch {
    /* ignora */
  }
}

function apiHeaders(token: string, accept = 'application/vnd.github+json'): HeadersInit {
  return {
    Accept: accept,
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

/**
 * Intestazioni per una **lettura**: il token è facoltativo perché il repo è
 * pubblico. Senza, il limite scende da 5000 richieste all'ora a 60 per
 * indirizzo IP — abbondante per una campanella, e vuol dire che lo storico si
 * vede anche su un dispositivo dove il token non è ancora stato messo.
 */
function readHeaders(token: string | null, accept = 'application/vnd.github+json'): HeadersInit {
  return token
    ? apiHeaders(token, accept)
    : { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' }
}

function repoUrl(cfg: GithubConfig): string {
  return `${API}/repos/${cfg.owner}/${cfg.repo}`
}

function contentsUrl(cfg: GithubConfig, path: string = cfg.dataPath): string {
  return `${repoUrl(cfg)}/contents/${path}`
}

async function failure(response: Response): Promise<GithubError> {
  /*
   * **Un 403 con le richieste finite è il limite, non un permesso.**
   *
   * GitHub risponde 403 in tutti e due i casi, e il messaggio del token manda a
   * cercare nelle spunte di un token che magari non c'è nemmeno — è lo stesso
   * inganno che ADR-0043 documenta per il 404 sulle scritture. L'intestazione
   * distingue, e si confronta con la **stringa**: assente torna `null`, e
   * `Number(null)` è `0`, che farebbe passare per limite proprio il permesso
   * negato. Il corpo JSON non si guarda: è prosa inglese, non contratto.
   *
   * La frase non dà per scontato che un token non ci sia — presumere la causa è
   * l'errore che questo ramo corregge. → ADR-0053
   */
  if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
    const reset = Number(response.headers.get('x-ratelimit-reset') ?? 0) * 1000
    const minuti = reset > 0 ? Math.max(1, Math.ceil((reset - Date.now()) / 60_000)) : undefined
    const quando =
      minuti === undefined
        ? '.'
        : minuti === 1
          ? ': riprova fra un minuto.'
          : `: riprova fra ${String(minuti)} minuti.`
    return new GithubError(
      403,
      `Hai esaurito le richieste che GitHub concede a questa rete${quando}` +
        ' Senza token il limite è 60 all\'ora, con un token in Impostazioni sale a 5000.',
    )
  }

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
      return `Permesso negato dal token: serve «Contents: read and write» se è fine-grained, «public_repo» se è classic. ${detail}`
    /*
     * Su una scrittura il 404 vuol dire quasi sempre «il token non può
     * scrivere»: GitHub risponde così, e non 403, per non rivelare cosa esiste.
     * La lettura non passa da qui — `getFile` tratta il suo 404 da sé — quindi
     * mettere la configurazione per prima mandava a cercare nel posto sbagliato,
     * ed è la frase che Federica ha letto mentre il problema era il token.
     * → ADR-0043, ADR-0040
     */
    case 404:
      return (
        'Il token non ha il permesso di scrivere (GitHub risponde «non trovato» invece di ' +
        '«vietato»). Se il repo non è tuo serve un token classic con la spunta «public_repo». ' +
        'Se il token è giusto, allora è il branch o il percorso del file nella configurazione.'
      )
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
  token: string | null,
  path: string = cfg.dataPath,
  /*
   * Il commit da cui leggere. Di norma la punta del branch — ma la campanella
   * chiede il file **a un commit preciso** e a quello prima, per sapere quale
   * spesa è comparsa: è l'unico modo di avere titolo e importo senza scriverli
   * in un messaggio di commit, che su un repo pubblico vuol dire pubblicarli.
   */
  ref: string = cfg.branch,
): Promise<RemoteFile | null> {
  const url = `${contentsUrl(cfg, path)}?ref=${encodeURIComponent(ref)}`
  const response = await fetch(url, { headers: readHeaders(token), cache: 'no-store' })
  if (response.status === 404) return null
  if (!response.ok) throw await failure(response)

  const body = (await response.json()) as { sha?: string; content?: string; encoding?: string }
  if (typeof body.sha !== 'string') throw new GithubError(500, 'Risposta GitHub senza sha del file.')

  // Oltre 1 MB l'API non include il contenuto: va richiesto in raw.
  if (typeof body.content === 'string' && body.content.length > 0 && body.encoding === 'base64') {
    return { sha: body.sha, text: new TextDecoder().decode(fromBase64(body.content)) }
  }

  const raw = await fetch(url, {
    headers: readHeaders(token, 'application/vnd.github.raw'),
    cache: 'no-store',
  })
  if (!raw.ok) throw await failure(raw)
  return { sha: body.sha, text: await raw.text() }
}

// ─────────────────────── lo storico dei cambiamenti ───────────────────────

/**
 * L'elenco dei commit, per la campanella delle novità.
 *
 * **Il token è facoltativo, e non è una svista.** Il repo è pubblico, quindi
 * questa lettura riesce anche senza — è la stessa cosa che rendeva inutile la
 * vecchia verifica dell'accesso (→ ADR-0043), e qui invece torna comoda: chi
 * non ha ancora messo il token vede lo storico lo stesso. Il prezzo è il limite
 * di richieste, che senza token è 60 all'ora per indirizzo IP e con token 5000:
 * a tre commit al giorno e una lettura per apertura non lo sfiora nessuno dei
 * due.
 *
 * Una pagina sola: cento commit coprono mesi al ritmo di questo repo, e la
 * campanella non è un archivio storico. Chi vuole tutto ha `git log`.
 */
export async function listCommits(
  cfg: GithubConfig,
  token: string | null,
  perPage = 100,
): Promise<RawCommit[]> {
  const url =
    `${repoUrl(cfg)}/commits` +
    `?sha=${encodeURIComponent(cfg.branch)}&per_page=${String(perPage)}`
  const response = await fetch(url, { headers: readHeaders(token), cache: 'no-store' })
  if (!response.ok) throw await failure(response)

  const body: unknown = await response.json()
  if (!Array.isArray(body)) throw new GithubError(500, 'Risposta GitHub inattesa per i commit.')

  const out: RawCommit[] = []
  for (const item of body) {
    if (typeof item !== 'object' || item === null) continue
    const row = item as {
      sha?: unknown
      commit?: { message?: unknown; author?: { name?: unknown; date?: unknown } }
      author?: { login?: unknown } | null
      parents?: { sha?: unknown }[]
    }
    const sha = typeof row.sha === 'string' ? row.sha : undefined
    const message = typeof row.commit?.message === 'string' ? row.commit.message : undefined
    const date = typeof row.commit?.author?.date === 'string' ? row.commit.author.date : undefined
    if (sha === undefined || message === undefined || date === undefined) continue
    out.push({
      sha,
      message,
      /*
       * `author.login` è l'account GitHub collegato, e va preferito al nome
       * dell'autore git: i commit di Alessio portano due nomi diversi — quello
       * del suo git locale e quello del suo account quando scrive l'app — ma un
       * login solo. Confrontare i nomi farebbe passare per «l'altra persona»
       * metà dei propri commit.
       */
      login: typeof row.author?.login === 'string' ? row.author.login : null,
      name: typeof row.commit?.author?.name === 'string' ? row.commit.author.name : 'qualcuno',
      date,
      /* Il primo genitore: è la versione con cui confrontare per sapere cosa
         quel commit ha cambiato. Arriva già nella stessa risposta, quindi non
         costa una richiesta in più. Manca solo sul primo commit del repo. */
      parent: typeof row.parents?.[0]?.sha === 'string' ? row.parents[0].sha : null,
    })
  }
  return out
}

/**
 * Il login dell'account a cui appartiene il token.
 *
 * Serve a sapere quali commit sono miei — le mie azioni non sono novità. Si
 * chiede una volta quando il token si salva o si verifica, e si tiene da parte:
 * non cambia mai, e una richiesta a ogni apertura sarebbe sprecata.
 */
export async function viewerLogin(token: string): Promise<string | null> {
  const response = await fetch(`${API}/user`, { headers: apiHeaders(token), cache: 'no-store' })
  if (!response.ok) return null
  const body: unknown = await response.json()
  if (typeof body === 'object' && body !== null && 'login' in body) {
    const login = (body as { login: unknown }).login
    return typeof login === 'string' ? login : null
  }
  return null
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
/**
 * La testa del branch, risolta **una volta**.
 *
 * Esiste perché `commitFiles` non se la risolva da sé, e non è pignoleria: chi
 * scrive deve leggere i file **alla stessa versione** su cui poi committa. Con
 * due risoluzioni separate — una implicita nel `?ref=<branch>` della lettura, una
 * dentro il commit — fra le due c'è una finestra, e un commit dell'altra persona
 * che ci finisca dentro viene **sovrascritto in silenzio**: l'albero costruito
 * sulla versione vecchia diventa figlio di quella nuova, il `PATCH` con
 * `force: false` è un avanzamento legittimo e GitHub non protesta. Nessun 422,
 * nessun tentativo di unione, le sue spese svanite. → ADR-0071
 */
export async function headSha(cfg: GithubConfig, token: string): Promise<string> {
  const response = await fetch(`${repoUrl(cfg)}/git/ref/heads/${encodeURIComponent(cfg.branch)}`, {
    headers: apiHeaders(token),
    cache: 'no-store',
  })
  if (!response.ok) throw await failure(response)
  const ref = (await response.json()) as { object?: { sha?: string } }
  const sha = ref.object?.sha
  if (!sha) throw new GithubError(500, `Il branch ${cfg.branch} non ha una testa leggibile.`)
  return sha
}

export async function commitFiles(
  cfg: GithubConfig,
  token: string,
  args: {
    files: readonly { path: string; text: string }[]
    message: string
    /**
     * Il commit su cui poggia questo, cioè la versione da cui i file sono stati
     * letti. È **obbligatorio** apposta: un ripiego che lo risolvesse qui
     * riaprirebbe la finestra che `headSha` esiste per chiudere, e lo farebbe in
     * silenzio, a chi se ne fosse dimenticato. → ADR-0071
     */
    parent: string
  },
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

  const blobs = await Promise.all(
    args.files.map((file) =>
      post<{ sha: string }>('/git/blobs', { content: file.text, encoding: 'utf-8' }),
    ),
  )

  const tree = await post<{ sha: string }>('/git/trees', {
    base_tree: args.parent,
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
    parents: [args.parent],
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

/**
 * Verifica dalle impostazioni che il token possa **scrivere**.
 *
 * Prima leggeva il file e diceva «accesso confermato», e non voleva dire niente:
 * il repo è pubblico, quindi quella lettura riesce **senza alcun token** — provato,
 * `GET /contents` risponde 200 anche senza header di autorizzazione. Un token in
 * sola lettura, scaduto o inventato passava il controllo, e chi lo vedeva verde
 * credeva di aver finito; poi ogni salvataggio restava in coda. È esattamente
 * quello che è successo a Federica col primo token. → ADR-0040
 *
 * La prova vera è **creare un blob**: è il primo passo del commit vero
 * (`commitFiles`), richiede lo stesso permesso, e produce un oggetto che nessun
 * commit referenzia — niente file, niente voce nella storia, niente da annullare.
 * Git lo raccoglie da sé.
 *
 * La lettura resta come secondo controllo, perché prende un caso che la scrittura
 * non vede: `dataPath` o `branch` sbagliati nella configurazione.
 */
export async function testAccess(cfg: GithubConfig, token: string): Promise<AccessCheck> {
  try {
    const probe = await fetch(`${repoUrl(cfg)}/git/blobs`, {
      method: 'POST',
      headers: { ...apiHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'margine: verifica accesso', encoding: 'utf-8' }),
    })
    if (!probe.ok) {
      /*
       * Un token senza permesso di scrittura riceve `404` e non `403`: GitHub
       * risponde così per non rivelare cosa esiste. Ma `404` è anche la risposta
       * a un repo che non c'è — `owner` o `repo` sbagliati nella configurazione —
       * e le due cose portano a rimedi opposti. Si distinguono con una lettura:
       * se il file si legge, il repo esiste e il problema è il permesso.
       */
      if (probe.status === 403 || probe.status === 404) {
        const readable = await getFile(cfg, token).catch(() => null)
        if (!readable) {
          return {
            ok: false,
            message:
              `Non trovo ${cfg.owner}/${cfg.repo} — o «${cfg.dataPath}» sul branch ${cfg.branch}. ` +
              'Prima di guardare il token, controlla la sezione `github` della configurazione.',
          }
        }
        /* Testo piano: finisce in un <p>, quindi asterischi e apici andrebbero
           a schermo così come sono scritti. */
        return {
          ok: false,
          message:
            'Questo token legge ma non può scrivere, quindi le modifiche resterebbero in coda. ' +
            'Se il repo non è tuo serve un token classic con la sola spunta «public_repo», da ' +
            'github.com/settings/tokens/new; se è tuo, un fine-grained con «Contents: read and write».',
        }
      }
      throw await failure(probe)
    }

    const file = await getFile(cfg, token)
    if (!file) {
      return {
        ok: false,
        message: `Il token può scrivere, ma «${cfg.dataPath}» non esiste sul branch ${cfg.branch}.`,
      }
    }
    return { ok: true, message: `Scrittura confermata su ${cfg.owner}/${cfg.repo}.` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Errore sconosciuto.' }
  }
}
