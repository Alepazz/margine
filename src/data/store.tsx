/**
 * Stato dell'applicazione: caricamento dei file cifrati, sblocco con la
 * passphrase, vista corrente (persona + mese) e sincronizzazione delle
 * annotazioni 730 verso il repo.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react'

import { currentMonthKey, monthKeyOf, todayIso, type MonthKey } from '../domain/dates'
import {
  APP_COMMIT_SUFFIX,
  CHANGE_GROUPS,
  noticesOf,
  unseenCount,
  parseChanges,
  touchesExpenses,
  unseenSince,
  type Change,
  type ChangeGroup,
  type NoticeItem,
  type RawCommit,
} from '../domain/changes'
import { diffExpenses, visibleDeltas, type ExpenseDelta } from '../domain/diff'
import { DEFAULT_VIEW, monthsOf, type ViewOptions } from '../domain/selectors'
import type {
  Annotation,
  AppConfig,
  CardsFile,
  Category,
  Dataset,
  Expense,
  IncomeProfile,
  LoyaltyCard,
  PersonId,
  PriceEntry,
  Settlement,
  ShoppingFile,
  ShoppingItem,
  Tricount,
} from '../domain/types'
import { WrongPassphraseError, decryptEnvelope, deriveKeyCached, encryptEnvelope } from './crypto'
import { isEnvelope, type Envelope, type KdfMeta } from './envelope'
import {
  GithubError,
  commitFiles,
  getFile,
  headSha,
  listCommits,
  loadLogin,
  loadToken,
  saveLogin,
  viewerLogin,
} from './github'
import {
  EMPTY_OUTBOX,
  applyCardOps,
  applyConfigOps,
  applyOps,
  applyShoppingOps,
  describeOps,
  fileOf,
  loadOutbox,
  newEntry,
  pendingTwin,
  pruneSettled,
  saveOutbox,
  type Op,
  type OutboxEntry,
  type OutboxState,
} from './outbox'

const DATA_URL = `${import.meta.env.BASE_URL}data/expenses.json.enc`
const CONFIG_URL = `${import.meta.env.BASE_URL}data/config.json.enc`
/**
 * Le carte fedeltà, il terzo envelope.
 *
 * **Può non esserci**, e non è un guasto: finché nessuno ha pubblicato una carta
 * il file non esiste, e il primo salvataggio lo crea. Un `404` qui vale «nessuna
 * carta», non «dati illeggibili» — trattarlo come gli altri due avrebbe impedito
 * l'apertura dell'app a chi non usa le carte. → ADR-0082
 */
const CARDS_URL = `${import.meta.env.BASE_URL}data/cards.json.enc`
/**
 * La lista della spesa, il quarto envelope. Come le carte **può non esserci**:
 * finché nessuno ha scritto niente il file non esiste, e la prima voce lo crea.
 *
 * Questo è il file che il sito serve all'apertura. Mentre la pagina della lista
 * è aperta se ne legge una versione più fresca **dall'API** (`refreshShopping`),
 * perché con una spunta per commit i deploy di Pages stanno in coda e il sito
 * resta indietro di minuti. → ADR-0090, ADR-0088
 */
const SHOPPING_URL = `${import.meta.env.BASE_URL}data/shopping.json.enc`
const PASSPHRASE_KEY = 'margine.passphrase.v1'
const PERSON_KEY = 'margine.person.v1'
/**
 * Quando è stata fatta la scelta. Non c'è sui dispositivi configurati prima di
 * ADR-0042: la scheda in Impostazioni mostra la data solo se la conosce, invece
 * di inventarne una.
 */
const IDENTITY_SINCE_KEY = 'margine.person.since.v1'
/*
 * Come parte l'app su **questo** dispositivo, non nei dati: «questo telefono
 * parte coperto» è una proprietà del telefono, e il Mac di casa può volere
 * l'opposto. Resta qui anche adesso che l'app saprebbe scriverlo nei dati.
 */
const HIDE_INCOME_KEY = 'margine.hideIncome.v1'
/**
 * **Due segni, non uno.**
 *
 * `seenAt` è dove si è **svuotato**: l'elenco mostra ciò che viene dopo.
 * `readAt` è dove si è **guardato**: il pallino conta ciò che viene dopo.
 * Chiudere il foglio muove il secondo, il pulsante li muove tutti e due — così
 * aprire per sbaglio non perde niente, e un elenco già letto non tiene acceso
 * il pallino. Con un segno solo i due gesti erano lo stesso gesto. → ADR-0061
 */
const NEWS_SEEN_KEY = 'margine.news.seenAt.v1'
const NEWS_READ_KEY = 'margine.news.readAt.v1'
/*
 * Quali gruppi di eventi **non** contano. Preferenza del dispositivo, non dei dati.
 *
 * Si salvano gli **spenti**, e la v1 salvava gli accesi: è la differenza fra un
 * gruppo nuovo che nasce acceso e uno che nasce spento in silenzio. Con la v1,
 * un dispositivo che aveva già toccato le spunte teneva solo i gruppi presenti
 * nella lista salvata, quindi «carte» — che allora non esisteva — non compariva:
 * niente riga nella campanella e niente pallino, senza un errore e senza un modo
 * di accorgersene. È la trappola di ADR-0054 vista dall'altro lato.
 */
const NEWS_GROUPS_KEY = 'margine.news.offGroups.v2'
/* La chiave vecchia, letta una volta per non perdere le spunte già scelte. */
const NEWS_GROUPS_KEY_V1 = 'margine.news.groups.v1'
/**
 * I gruppi che esistevano quando la v1 è stata scritta.
 *
 * Serve alla conversione e **non è `CHANGE_GROUPS`**: per sapere quali gruppi
 * qualcuno aveva spento bisogna sapere fra quali stava scegliendo. Con l'elenco
 * di oggi, un gruppo aggiunto dopo risulterebbe «spento a mano» — che è
 * esattamente il difetto da cui si scappa. Questa lista non si aggiorna mai.
 */
const NEWS_GROUPS_V1: readonly ChangeGroup[] = ['spese', 'prezzi', 'tricount', 'config']
/* Non più di una rilettura al minuto: passare fra le app non è un evento. */
const REFRESH_EVERY_MS = 60_000
/**
 * Quante novità caricano il contenuto da sole.
 *
 * Sta **nello store** e non nel foglio perché il numero sul pallino conta le
 * righe, e le righe delle spese esistono solo se il dettaglio è stato letto:
 * aspettare l'apertura della campanella vorrebbe dire mostrare un numero
 * sbagliato fino a quel momento. Oltre il tetto le righe restano quelle
 * generiche, che contano una per operazione — un'approssimazione dichiarata,
 * che si presenta solo dopo una lunga assenza.
 */
const MAX_AUTO_DETAIL = 5
/**
 * Quante versioni decifrate tenere in memoria.
 *
 * **Due bastano**, e non è una stima: le letture sono in fila e ogni versione
 * serve al massimo due volte di seguito — `read(sha)` e `read(genitore)`, e al
 * giro dopo quel genitore è il `sha` della novità successiva. Non si torna mai
 * indietro su una versione superata. Tenerne cinque vorrebbe dire tre dataset
 * decifrati da circa un megabyte l'uno fermi nella memoria di un telefono senza
 * che nessuno li richieda mai. Tre, per un margine che non costa quasi niente.
 */
const MAX_CACHED_VERSIONS = 3
const SYNC_DEBOUNCE_MS = 1200

export type Status = 'boot' | 'locked' | 'unlocking' | 'ready' | 'error'

export type SyncPhase = 'idle' | 'syncing' | 'error' | 'no-config' | 'no-token'

export interface SyncState {
  phase: SyncPhase
  pending: number
  lastError?: string
  lastSyncAt?: number
}

interface Envelopes {
  data: Envelope
  config: Envelope
  /** Assente quando nel repo non c'è ancora nessuna carta. */
  cards?: Envelope
  /** Assente quando nel repo non c'è ancora nessuna lista. */
  shopping?: Envelope
}

export interface StoreApi {
  status: Status
  error?: string
  config?: AppConfig
  dataset?: Dataset
  /**
   * Le carte fedeltà. **Condivise**: non passano da `view.person`, come i
   * prezzi. Lista vuota anche quando il file non esiste, così nessuna pagina
   * deve distinguere «nessuna carta» da «file non ancora pubblicato»: quella
   * differenza serve solo alla coda, e resta là. → ADR-0082
   */
  cards: LoyaltyCard[]
  /**
   * La lista della spesa, tutte le voci: quelle da prendere e quelle nel
   * storico, che si distinguono per `takenAt`. **Condivisa** come le carte e i
   * prezzi: non passa da `view.person`. Lista vuota anche quando il file non
   * esiste, così nessuna pagina deve distinguere «niente da comprare» da «file
   * non ancora pubblicato» — quella differenza serve solo alla coda, e resta là.
   * → ADR-0088
   */
  shopping: ShoppingItem[]
  months: MonthKey[]
  month: MonthKey
  view: ViewOptions
  sync: SyncState
  hasStoredPassphrase: boolean
  /**
   * Di chi è questo dispositivo. `undefined` = non ancora scelto, e allora
   * l'app mostra la schermata che lo chiede invece delle pagine. → ADR-0042
   */
  identity?: PersonId
  /** Quando è stata fatta la scelta, se il dispositivo lo sa. */
  identitySince?: string
  /** Guadagni oscurati adesso. Il tocco vale per questa sessione. */
  hideIncome: boolean
  /** Come parte l'app su questo dispositivo: questo è ciò che resta. */
  hideIncomeByDefault: boolean
  /** Le novità dell'altra persona: la campanella. → ADR-0051 */
  news: NewsState
  unlock: (passphrase: string, remember: boolean) => Promise<void>
  lock: () => void
  setMonth: (month: MonthKey) => void
  /**
   * Dice di chi è questo dispositivo, **una volta sola**: se la scelta c'è già
   * non fa niente. Il rifiuto sta qui e non solo nell'assenza di un pulsante,
   * perché è la garanzia richiesta — non una comodità dell'interfaccia.
   * → ADR-0042
   */
  chooseIdentity: (person: PersonId) => void
  setIncludeVacations: (include: boolean) => void
  toggleHideIncome: () => void
  setHideIncomeByDefault: (hidden: boolean) => void
  annotate: (expenseId: string, patch: Omit<Annotation, 'expenseId'>) => void
  addExpense: (expense: Expense) => void
  updateExpense: (expenseId: string, fields: Partial<Expense>) => void
  deleteExpense: (expenseId: string) => void
  addTricount: (tricount: Tricount) => void
  updateTricount: (tricountId: string, fields: Partial<Tricount>) => void
  /** L'elenco intero delle categorie: si sostituisce, non si modifica in punta. */
  setCategories: (categories: Category[]) => void
  /** Sposta tutte le spese da una categoria a un'altra. */
  recategorize: (from: string, to: string) => void
  setIncome: (person: PersonId, profile: IncomeProfile) => void
  addSettlement: (settlement: Settlement) => void
  removeSettlement: (settlementId: string) => void
  /** Una rilevazione di prezzo. Si aggiunge e si elimina: non si modifica. → ADR-0041 */
  addPrice: (entry: PriceEntry) => void
  deletePrice: (priceId: string) => void
  /**
   * Una carta fedeltà. Si modifica, a differenza di un prezzo: una carta è uno
   * stato — il nome si corregge, la faccia si sostituisce. → ADR-0082
   */
  addCard: (card: LoyaltyCard) => void
  updateCard: (cardId: string, fields: Partial<LoyaltyCard>) => void
  deleteCard: (cardId: string) => void
  /**
   * La lista della spesa. `takeItem` e `untakeItem` sono i due gesti della
   * cassa, e sono separati dalla modifica perché sono l'operazione più frequente
   * dell'app: il messaggio di commit deve poter dire «1 cosa presa», e la
   * campanella deve poterle tacere. → ADR-0088, ADR-0091
   */
  addItem: (item: ShoppingItem) => void
  updateItem: (itemId: string, fields: Partial<ShoppingItem>) => void
  takeItem: (itemId: string) => void
  untakeItem: (itemId: string) => void
  deleteItem: (itemId: string) => void
  /**
   * Rilegge la lista **dall'API**, che è aggiornata appena il commit passa.
   *
   * Serve perché con una spunta per commit i deploy di GitHub Pages stanno in
   * coda uno alla volta (misurati: 31–51 s l'uno), quindi il sito resta indietro
   * di minuti e le spunte dell'altra persona non arriverebbero. La chiama la
   * pagina della lista finché è aperta.
   *
   * Torna **perché** non ha letto e non solo che non ha letto: senza token è uno
   * stato normale di cui la spia di sincronizzazione parla già, e ripeterlo
   * nella pagina sarebbe rumore; una lettura **fallita** invece è una cosa che
   * chi guarda deve sapere, perché quello che vede può essere vecchio.
   * → ADR-0090
   */
  refreshShopping: () => Promise<ProbeResult>
  syncNow: () => Promise<void>
  reload: () => void
  /**
   * **Guardate.** Lo chiama la chiusura del foglio: spegne il pallino e non
   * tocca l'elenco. → ADR-0061
   */
  markNewsRead: () => void
  /**
   * **Archiviate.** Lo chiama il pulsante nel piede: svuota l'elenco, e con lui
   * il pallino. Sono due gesti diversi di proposito — confonderli faceva
   * sparire una notifica mentre la stavi guardando. → ADR-0061, ADR-0052
   */
  markNewsSeen: () => void
  setNewsGroups: (groups: readonly ChangeGroup[]) => void
  /** Chiede il dettaglio di una novità: cosa ha toccato quel commit. */
  loadNewsDetail: (change: Change) => Promise<void>
  /** Com'è andata la richiesta del dettaglio. `undefined` = non ancora chiesto. */
  newsDetail: (sha: string) => NewsDetail | undefined
}

/** Com'è andata la sonda della lista: `no-token` è uno stato normale, non un guasto. */
export type ProbeResult = 'ok' | 'no-token' | 'failed'

export type NewsDetail =
  | { state: 'loading' }
  | { state: 'failed'; reason: string }
  | { state: 'done'; deltas: ExpenseDelta[] }

export interface NewsState {
  /** I commit non ancora svuotati, dal più recente. */
  changes: Change[]
  /** Le righe da mostrare: una per cosa, non per salvataggio. */
  notices: NoticeItem[]
  /** Il numero sul pallino: **è** la lunghezza di `notices`, non una stima. */
  unseen: number
  /** I gruppi accesi in Impostazioni. */
  groups: ChangeGroup[]
  /** Vero mentre si sta leggendo l'elenco: la campanella non si blocca comunque. */
  loading: boolean
  /**
   * Perché l'elenco non si è potuto leggere.
   *
   * Senza, una campanella vuota per un guasto è indistinguibile da una vuota
   * perché non è successo niente — e la seconda è rassicurante mentre la prima
   * non lo è. È il posto dove sta scritto il motivo: gli altri due punti che lo
   * riguardano — il `catch` di `loadNews` e il foglio — rimandano qui.
   * → ADR-0053, ADR-0043
   */
  error?: string
  /**
   * So qual è il mio login GitHub, e quindi so che le righe rimaste sono
   * dell'altra persona.
   *
   * Quando è falso — nessun token, login mai imparato — l'elenco comprende
   * anche i miei commit, e **chi ha fatto cosa non si può affermare**: il
   * foglio deve mostrare l'autore invece dell'emoji dell'altra persona.
   * Attribuire per assunzione è peggio che non attribuire.
   */
  knowsMe: boolean
}

const StoreContext = createContext<StoreApi | null>(null)

async function fetchEnvelope(url: string): Promise<Envelope> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`)
  const parsed: unknown = await response.json()
  if (!isEnvelope(parsed)) throw new Error(`${url} non è un file cifrato di Giano.`)
  return parsed
}

/**
 * I file cifrati scritti prima di ADR-0019 non hanno `settlements`, quelli
 * prima di ADR-0041 non hanno `prices`. Si normalizzano appena il dato entra,
 * così il tipo dice la verità in tutto il resto dell'app invece di costringere
 * ogni lettore a un `?? []`.
 *
 * Il modello **prima** dei tricount (ADR-0037) invece non si normalizza: si
 * rifiuta con una frase che dice cosa fare. È un caso che capita davvero per un
 * minuto — GitHub Pages può servire il file vecchio subito dopo un deploy, e un
 * telefono può averlo in cache — e senza questo controllo l'app si aprirebbe
 * mostrando zeri al posto di venti mesi di spese: un guasto che sembra un dato.
 *
 * La differenza fra i due casi è che un campo **aggiunto** si normalizza e un
 * campo **cambiato di forma** si rifiuta: nel primo caso il dato vecchio è
 * ancora vero, nel secondo direbbe il falso.
 */
function normaliseDataset(raw: Dataset & { trips?: unknown }): Dataset {
  if (!Array.isArray(raw.tricounts)) {
    throw new Error(
      'Questi dati sono nel formato precedente ai tricount con i membri. ' +
        'Ricarica la pagina: se insiste, è la cache di GitHub Pages e passa da sé in un minuto.',
    )
  }
  if (Array.isArray(raw.settlements) && Array.isArray(raw.prices)) return raw
  return {
    ...raw,
    settlements: Array.isArray(raw.settlements) ? raw.settlements : [],
    prices: Array.isArray(raw.prices) ? raw.prices : [],
  }
}

/**
 * Come `fetchEnvelope`, ma un file che non c'è non è un errore.
 *
 * Serve al solo file delle carte: prima della prima carta non esiste, e l'app
 * deve aprirsi comunque. Un file **illeggibile** invece resta un guasto e si
 * vede, altrimenti un problema di rete diventerebbe un elenco vuoto e
 * rassicurante — la lezione di ADR-0053 applicata a un file invece che a una
 * lettura di commit.
 *
 * «Non c'è» si riconosce in **due** modi, e il secondo l'ha insegnato il banco:
 *
 * - un `404`, che è quello che risponde GitHub Pages in produzione;
 * - una risposta `200` il cui corpo è **HTML**, che è quello che risponde il
 *   server di sviluppo — che per un percorso sconosciuto serve `index.html`,
 *   il ripiego per le rotte di una SPA. Senza questo ramo `npm run dev` non
 *   apriva l'app affatto: `response.json()` inciampava sulla pagina e l'errore
 *   diventava «non riesco a leggere i dati cifrati», cioè un guasto grave al
 *   posto di «nessuna carta». Una pagina HTML al posto di un envelope non è
 *   ambigua: un file cifrato non comincia mai per `<`.
 */
async function fetchOptionalEnvelope(url: string): Promise<Envelope | undefined> {
  const response = await fetch(url, { cache: 'no-store' })
  if (response.status === 404) return undefined
  if (!response.ok) throw new Error(`${url} → HTTP ${String(response.status)}`)
  const text = await response.text()
  if (text.trimStart().startsWith('<')) return undefined
  /* Da qui in poi si pretende un envelope: `JSON.parse` che lancia e un envelope
     che non lo è sono guasti, e li si dice. */
  const parsed: unknown = JSON.parse(text)
  if (!isEnvelope(parsed)) throw new Error(`${url} non è un file cifrato di Giano.`)
  return parsed
}

/**
 * I quattro file cifrati, insieme: è ciò che l'avvio e la rilettura periodica
 * scaricano, e va scritto una volta perché due dei quattro sono **facoltativi**
 * — le chiavi `cards` e `shopping` ci sono solo se i file esistono, e due copie
 * di questa regola sarebbero due occasioni di dimenticarla.
 */
async function fetchAllEnvelopes(): Promise<Envelopes> {
  const [data, config, cards, shopping] = await Promise.all([
    fetchEnvelope(DATA_URL),
    fetchEnvelope(CONFIG_URL),
    fetchOptionalEnvelope(CARDS_URL),
    fetchOptionalEnvelope(SHOPPING_URL),
  ])
  return { data, config, ...(cards ? { cards } : {}), ...(shopping ? { shopping } : {}) }
}

/** Le carte decifrate, o `undefined` quando il file non c'è. */
async function decryptCards(
  envelope: Envelope | undefined,
  passphrase: string,
): Promise<CardsFile | undefined> {
  if (!envelope) return undefined
  const key = await deriveKeyCached(passphrase, envelope.kdf)
  return normaliseCards(await decryptEnvelope<CardsFile>(envelope, key))
}

/** Un file delle carte appena nato: è quello che il primo salvataggio scrive. */
function emptyCardsFile(): CardsFile {
  return { version: 1, updatedAt: new Date().toISOString(), cards: [] }
}

/** Come `normaliseDataset`: il tipo deve dire la verità da qui in avanti. */
function normaliseCards(raw: CardsFile): CardsFile {
  return { ...raw, cards: Array.isArray(raw.cards) ? raw.cards : [] }
}

/** La lista decifrata, o `undefined` quando il file non c'è. */
async function decryptShopping(
  envelope: Envelope | undefined,
  passphrase: string,
): Promise<ShoppingFile | undefined> {
  if (!envelope) return undefined
  const key = await deriveKeyCached(passphrase, envelope.kdf)
  return normaliseShopping(await decryptEnvelope<ShoppingFile>(envelope, key))
}

/** Una lista appena nata: è quella che la prima voce scrive. */
function emptyShoppingFile(): ShoppingFile {
  return { version: 1, updatedAt: new Date().toISOString(), items: [] }
}

function normaliseShopping(raw: ShoppingFile): ShoppingFile {
  return { ...raw, items: Array.isArray(raw.items) ? raw.items : [] }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Errore sconosciuto.'
}

function commitMessage(entries: readonly OutboxEntry[]): string {
  return `${describeOps(entries)}${APP_COMMIT_SUFFIX}`
}

/** Un segno da `localStorage`: senza storage si riparte da zero, e va bene. */
function readMark(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined
  } catch {
    return undefined
  }
}

/**
 * I gruppi accesi: tutti tranne quelli spenti a mano.
 *
 * Senza niente in memoria sono **tutti** — una campanella che parte muta si
 * direbbe rotta — e un gruppo che nessuno ha mai spento è acceso, anche se è
 * nato dopo l'ultima volta che si sono toccate le spunte.
 */
function readNewsGroups(): ChangeGroup[] {
  const off = readOffGroups()
  return CHANGE_GROUPS.filter((group) => !off.includes(group))
}

/** I gruppi spenti, dalla chiave nuova o convertiti da quella vecchia. */
function readOffGroups(): ChangeGroup[] {
  try {
    const raw = localStorage.getItem(NEWS_GROUPS_KEY)
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) return CHANGE_GROUPS.filter((group) => parsed.includes(group))
      return []
    }
    /* Niente v2: si legge la v1, che elencava gli **accesi** fra i gruppi di
       allora. Spento = era fra quelli e non c'è. */
    const legacy: unknown = JSON.parse(localStorage.getItem(NEWS_GROUPS_KEY_V1) ?? 'null')
    if (!Array.isArray(legacy)) return []
    return NEWS_GROUPS_V1.filter((group) => !legacy.includes(group))
  } catch {
    return []
  }
}

/**
 * All'apertura i guadagni partono **coperti**, finché non si dice il contrario.
 *
 * Il difetto ha due versi e non si equivalgono: partire in chiaro mostra lo
 * stipendio a chi ti guarda lo schermo prima che tu ci pensi, partire coperti
 * costa un tocco. Perciò l'assenza della chiave vale «coperti», e anche il
 * ripiego quando `localStorage` non risponde. → ADR-0066
 */
function readHideIncomeDefault(): boolean {
  try {
    return localStorage.getItem(HIDE_INCOME_KEY) !== 'off'
  } catch {
    return true
  }
}

/**
 * Di chi è questo dispositivo, se lo ha già detto.
 *
 * `undefined` quando la scelta non è ancora stata fatta, e **non** un ripiego su
 * `'me'`: era il difetto vero di prima di ADR-0042. Un telefono appena aperto —
 * o uno a cui sono stati svuotati i dati del sito — partiva dalla vista di
 * Alessio, compreso il suo compartimento personale, senza che nessuno avesse
 * scelto niente. Chi apre l'app senza identità vede la schermata che la chiede,
 * non i numeri di qualcuno.
 */
function readIdentity(): PersonId | undefined {
  try {
    const raw = localStorage.getItem(PERSON_KEY)
    return raw === 'partner' || raw === 'me' ? raw : undefined
  } catch {
    return undefined
  }
}

function readIdentitySince(): string | undefined {
  try {
    return localStorage.getItem(IDENTITY_SINCE_KEY) ?? undefined
  } catch {
    return undefined
  }
}

export function StoreProvider({ children }: { children: ReactNode }): ReactNode {
  const [status, setStatus] = useState<Status>('boot')
  const [error, setError] = useState<string | undefined>()
  const [envelopes, setEnvelopes] = useState<Envelopes | undefined>()
  const [config, setConfig] = useState<AppConfig | undefined>()
  const [dataset, setDataset] = useState<Dataset | undefined>()
  /*
   * `undefined` = il file delle carte non c'è (o non è ancora arrivato), che è
   * un'informazione diversa da «zero carte» e serve alla coda: senza di essa un
   * `card-delete` risulterebbe applicato prima di essere partito. Le pagine
   * ricevono comunque una lista, da `api`.
   */
  const [cards, setCards] = useState<CardsFile | undefined>()
  const [shopping, setShopping] = useState<ShoppingFile | undefined>()
  const [month, setMonth] = useState<MonthKey>(currentMonthKey())
  const [identity, setIdentity] = useState<PersonId | undefined>(readIdentity)
  const [identitySince, setIdentitySince] = useState<string | undefined>(readIdentitySince)
  /*
   * `person` deve essere una `PersonId` perché lo è in tutti i selettori, quindi
   * senza identità porta `'me'` — un valore che **nessuno deve vedere**. Non lo
   * vede: `App` mostra la schermata dell'identità prima delle pagine, e
   * `useReadyStore` (la porta da cui passano tutte) si rifiuta di aprire senza
   * identità scelta. Togliere una delle due guardie rimetterebbe in piedi il
   * difetto per cui esiste ADR-0042.
   */
  const [view, setView] = useState<ViewOptions>({ ...DEFAULT_VIEW, person: readIdentity() ?? 'me' })
  const [outbox, setOutbox] = useState<OutboxState>(EMPTY_OUTBOX)
  const [sync, setSync] = useState<SyncState>({ phase: 'idle', pending: 0 })
  const [changes, setChanges] = useState<Change[]>([])
  const [newsSeenAt, setNewsSeenAt] = useState<string | undefined>(() => readMark(NEWS_SEEN_KEY))
  const [newsReadAt, setNewsReadAt] = useState<string | undefined>(() => readMark(NEWS_READ_KEY))
  const [newsGroups, setNewsGroupsState] = useState<ChangeGroup[]>(readNewsGroups)
  const [newsLoading, setNewsLoading] = useState(false)
  const [newsError, setNewsError] = useState<string | undefined>()
  const [myLogin, setMyLogin] = useState<string | undefined>(() => loadLogin() ?? undefined)
  const lastRefresh = useRef(0)
  /**
   * Dettaglio per commit: `sha` → com'è andata.
   *
   * Tiene anche i tentativi **falliti**, e non è pignoleria: un pulsante che
   * scarica mezzo megabyte, non ci riesce e non dice niente è il difetto di
   * ADR-0043 rifatto. Chi guarda deve poter distinguere «sto leggendo» da «non
   * si può leggere», e la seconda deve dire perché.
   */
  const detailCache = useRef(new Map<string, NewsDetail>())
  /**
   * La stessa mappa, in stato, perché un `ref` che muta non fa ridisegnare
   * niente. Il ref resta perché `loadDetail` deve **leggere** cosa c'è già
   * prima di scrivere, e con il solo stato leggerebbe il valore del render in
   * cui è stato creato. Si aggiornano insieme, in `putDetail`.
   */
  const [details, setDetails] = useState<Map<string, NewsDetail>>(new Map())
  /** L'ultima versione **remota** vista, senza l'overlay della coda locale. */
  const lastRemote = useRef<Dataset | undefined>(undefined)
  /**
   * Il confronto che la rilettura ha già in mano.
   *
   * Se dall'ultima volta è arrivato **un commit solo**, questo confronto È il
   * dettaglio di quel commit: si mette in cache senza scaricare niente. Se ne
   * sono arrivati più d'uno l'attribuzione sarebbe indovinata, e allora si
   * butta — il dettaglio si scaricherà a richiesta, per il commit giusto.
   */
  const freeDiff = useRef<{ before: Dataset; after: Dataset } | undefined>(undefined)
  /** Gli sha già conosciuti: servono a capire se ne è arrivato uno solo. */
  const knownShas = useRef<Set<string> | undefined>(undefined)
  /** I commit come sono arrivati, per poter rifiltrare senza riscaricare. */
  const rawCommits = useRef<RawCommit[]>([])
  /** Quando si è letta la lista l'ultima volta: vedi `loadNews`. */
  const lastNews = useRef(0)
  /**
   * I dati decifrati a un certo commit, tenuti da parte.
   *
   * Serve perché **commit consecutivi condividono i file**: il genitore di uno
   * è l'altro. Tre novità di fila vogliono quattro versioni, non sei, e con la
   * cache si scaricano quattro volte invece di sei. Il tetto c'è perché un
   * dataset decifrato pesa in memoria molto più del file che lo porta.
   */
  const fileCache = useRef(new Map<string, Dataset>())

  const [hasStoredPassphrase, setHasStoredPassphrase] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [hideIncomeByDefault, setDefaultHidden] = useState(readHideIncomeDefault)
  const [hideIncome, setHideIncome] = useState(readHideIncomeDefault)

  const passphraseRef = useRef<string | undefined>(undefined)
  /**
   * I parametri di derivazione dei file già letti.
   *
   * Servono a **creare** il file delle carte la prima volta: `publish.mjs` cifra
   * i file con lo stesso salt di proposito, così l'app deriva una chiave sola
   * invece di tre — e 600.000 iterazioni su un telefono non sono gratis.
   * Generarne uno nuovo per il file nuovo funzionerebbe, e costerebbe una
   * derivazione in più a ogni sblocco, per sempre. → ADR-0082
   */
  const kdfRef = useRef<KdfMeta | undefined>(undefined)
  const configRef = useRef<AppConfig | undefined>(undefined)
  const outboxRef = useRef<OutboxState>(EMPTY_OUTBOX)
  const flushTimer = useRef<number | undefined>(undefined)
  /* Un giro alla volta: `flush` è esposto come `syncNow`, quindi il pulsante
     delle impostazioni e il timer del debounce possono partire insieme. */
  const flushing = useRef(false)

  const persistOutbox = useCallback((next: OutboxState) => {
    outboxRef.current = next
    setOutbox(next)
    saveOutbox(next)
  }, [])

  // ── Sincronizzazione verso il repo ──────────────────────────────────────

  /**
   * Un giro di sincronizzazione: legge il remoto, ci applica la coda, committa.
   *
   * Due cose qui sono la correzione di altrettanti modi di perdere dati in
   * silenzio, e vale la pena che stiano scritte accanto al codice che le evita.
   *
   * **La testa si risolve prima di leggere.** I file si leggono `?ref=<sha>` su
   * quella testa esatta, e la stessa testa va a `commitFiles` come genitore.
   * Prima la lettura usava `?ref=<branch>` e il commit si ririsolveva la testa da
   * sé: fra i due momenti c'era una finestra, e un commit dell'altra persona che
   * ci finisse dentro veniva sovrascritto senza un 422 e senza un tentativo di
   * unione. Ora un commit interposto rende il nostro genitore vecchio, GitHub
   * rifiuta con 422, e il tentativo qui sotto rilegge tutto da capo. → ADR-0071
   *
   * **Si toglie dalla coda solo ciò che è stato committato.** Prima si azzerava
   * la coda intera (`pending: []`), e tutto ciò che entrava mentre il commit era
   * in volo — una finestra di secondi, che il modulo dei prezzi rende normale
   * perché non si chiude quando salva — spariva senza essere mai stato scritto.
   * → ADR-0070
   */
  /**
   * Il salvataggio, per il file che l'operazione tocca.
   *
   * Le tre strade fanno la stessa cosa — leggi il remoto a quella versione,
   * decifra, applica la coda, ricifra — e sono scritte una volta a testa perché
   * ognuna ha un tipo suo. Ciò che **non** si ripete è la regola: si riscrive
   * solo il file che qualcosa ha toccato, e lo dice `fileOf`.
   */
  const flushOnce = useCallback(async (): Promise<void> => {
    const pending = outboxRef.current.pending
    if (pending.length === 0) {
      setSync((s) => ({ ...s, phase: 'idle', pending: 0 }))
      return
    }
    const github = configRef.current?.github
    if (!github) {
      setSync({ phase: 'no-config', pending: pending.length })
      return
    }
    const token = loadToken()
    if (!token) {
      setSync({ phase: 'no-token', pending: pending.length })
      return
    }
    const passphrase = passphraseRef.current
    if (!passphrase) {
      /* Era un `return` muto: nessuno stato, nessun messaggio, e il contatore
         delle modifiche in attesa restava fermo senza dire perché. Un percorso
         in cui non succede niente e niente lo spiega è il modo più veloce di
         perdere mezza giornata. */
      setSync({
        phase: 'error',
        pending: pending.length,
        lastError: 'I dati sono bloccati: sbloccali con la passphrase perché le modifiche possano partire.',
      })
      return
    }

    setSync({ phase: 'syncing', pending: pending.length })
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        /*
         * **Una voce che non si potrà mai committare non blocca le altre.**
         *
         * Il percorso di un file può mancare in `config.json` — è la regola di
         * ADR-0024, non si indovina un percorso su cui poi si committa, e per le
         * carte c'è un'aggravante: quel file può non esistere, quindi un percorso
         * sbagliato lo **creerebbe** invece di dare errore. Ma il modo in cui la
         * mancanza si faceva sentire era un `throw` sull'intero lotto, ed era un
         * difetto grave: la voce impossibile restava in coda, ogni salvataggio
         * successivo ricostruiva lo stesso lotto, e **niente ripartiva più** —
         * né spese, né prezzi, né rimborsi. L'unica via d'uscita era svuotare i
         * dati del sito, cioè perdere la coda.
         *
         * Quindi si separa: si committa ciò che si può, e ciò che non si può si
         * dice. Le voci impossibili restano in attesa — il percorso può comparire
         * in `config.json` domani, e allora partiranno.
         */
        const senzaPercorso = (entry: OutboxEntry): boolean => {
          const target = fileOf(entry)
          if (target === 'config') return !github.configPath
          if (target === 'cards') return !github.cardsPath
          if (target === 'shopping') return !github.shoppingPath
          return false
        }
        const bloccate = outboxRef.current.pending.filter(senzaPercorso)
        const entries = outboxRef.current.pending.filter((entry) => !senzaPercorso(entry))
        if (entries.length === 0) {
          setSync({
            phase: 'error',
            pending: bloccate.length,
            lastError: `${describeOps(bloccate)}: manca il percorso del file in config.json, quindi non possono partire.`,
          })
          return
        }

        /*
         * Si riscrive **solo** ciò che qualcosa ha toccato, e vale nei due versi:
         * ogni cifratura usa un IV nuovo, quindi riscrivere un file per abitudine
         * produce un file diverso a ogni salvataggio anche senza modifiche —
         * 350 kB di diff per un rinomino di categoria, o un diff sulla
         * configurazione per ogni spesa aggiunta.
         */
        const withData = entries.some((entry) => fileOf(entry) === 'data')
        const withConfig = entries.some((entry) => fileOf(entry) === 'config')
        const withCards = entries.some((entry) => fileOf(entry) === 'cards')
        const withShopping = entries.some((entry) => fileOf(entry) === 'shopping')

        /* La versione su cui si legge **e** su cui si committa: una sola. */
        const parent = await headSha(github, token)

        const files: { path: string; text: string }[] = []
        let merged: Dataset | undefined

        if (withData) {
          const remote = await getFile(github, token, github.dataPath, parent)
          if (!remote) {
            throw new GithubError(404, `Nel repo non c'è ${github.dataPath}: fai un primo push dei dati.`)
          }
          const parsed: unknown = JSON.parse(remote.text)
          if (!isEnvelope(parsed)) throw new Error('Il file nel repo non è un file cifrato di Giano.')

          const key = await deriveKeyCached(passphrase, parsed.kdf)
          const remoteDataset = normaliseDataset(await decryptEnvelope<Dataset>(parsed, key))
          merged = applyOps({ ...remoteDataset, updatedAt: new Date().toISOString() }, entries)
          const nextEnvelope = await encryptEnvelope(merged, key, parsed.kdf)
          files.push({ path: github.dataPath, text: `${JSON.stringify(nextEnvelope, null, 2)}\n` })
        }

        let mergedConfig: AppConfig | undefined
        if (withConfig && github.configPath) {
          const remoteConfig = await getFile(github, token, github.configPath, parent)
          if (!remoteConfig) {
            throw new GithubError(404, `Nel repo non c'è ${github.configPath}.`)
          }
          const parsedConfig: unknown = JSON.parse(remoteConfig.text)
          if (!isEnvelope(parsedConfig)) {
            throw new Error('La configurazione nel repo non è un file cifrato di Giano.')
          }
          const configKey = await deriveKeyCached(passphrase, parsedConfig.kdf)
          const decrypted = await decryptEnvelope<AppConfig>(parsedConfig, configKey)
          mergedConfig = applyConfigOps(decrypted, entries)
          const envelope = await encryptEnvelope(mergedConfig, configKey, parsedConfig.kdf)
          files.push({ path: github.configPath, text: `${JSON.stringify(envelope, null, 2)}\n` })
        }

        let mergedCards: CardsFile | undefined
        if (withCards && github.cardsPath) {
          const remoteCards = await getFile(github, token, github.cardsPath, parent)
          /*
           * **Il file può non esistere, e la prima carta lo crea.** È l'unico dei
           * tre a poter mancare: le spese e la configurazione ci sono da prima
           * dell'app. Un `404` qui non è un errore da mostrare — sarebbe «fai un
           * primo push delle carte», cioè una sessione al Mac per aggiungere una
           * tessera dal telefono. `getFile` torna `null` **solo** su un 404 e
           * lancia su tutto il resto, quindi non si rischia di sostituire un file
           * esistente con uno vuoto per un guasto di rete.
           *
           * La chiave si deriva allora da `kdf` **del dataset**, che è l'unico
           * modo di scegliere: `publish.mjs` cifra i file con lo stesso salt
           * apposta, così l'app deriva una chiave sola invece di tre (600.000
           * iterazioni su un telefono non sono gratis). Alla lettura successiva
           * il file avrà la sua `kdf` e sarà quella a valere.
           */
          const base = remoteCards ? (JSON.parse(remoteCards.text) as unknown) : undefined
          if (base !== undefined && !isEnvelope(base)) {
            throw new Error('Il file delle carte nel repo non è un file cifrato di Giano.')
          }
          const kdf = base?.kdf ?? kdfRef.current
          if (!kdf) {
            throw new Error('Non conosco i parametri di cifratura: ricarica la pagina.')
          }
          const cardsKey = await deriveKeyCached(passphrase, kdf)
          const current = base
            ? normaliseCards(await decryptEnvelope<CardsFile>(base, cardsKey))
            : emptyCardsFile()
          mergedCards = applyCardOps(current, entries)
          const envelope = await encryptEnvelope(mergedCards, cardsKey, kdf)
          files.push({ path: github.cardsPath, text: `${JSON.stringify(envelope, null, 2)}\n` })
        }

        /*
         * La lista, con la stessa forma delle carte e per le stesse ragioni: il
         * file può non esistere, un `404` non è un errore da mostrare (sarebbe
         * «fai un primo push della lista», cioè una sessione al Mac per segnare
         * il latte), e la `kdf` da riusare quando il file nasce è quella del
         * dataset — i quattro file condividono il salt di proposito, così l'app
         * deriva una chiave sola invece di quattro. → ADR-0088, ADR-0082
         */
        let mergedShopping: ShoppingFile | undefined
        if (withShopping && github.shoppingPath) {
          const remoteShopping = await getFile(github, token, github.shoppingPath, parent)
          const base = remoteShopping ? (JSON.parse(remoteShopping.text) as unknown) : undefined
          if (base !== undefined && !isEnvelope(base)) {
            throw new Error('La lista nel repo non è un file cifrato di Giano.')
          }
          const kdf = base?.kdf ?? kdfRef.current
          if (!kdf) {
            throw new Error('Non conosco i parametri di cifratura: ricarica la pagina.')
          }
          const shoppingKey = await deriveKeyCached(passphrase, kdf)
          const current = base
            ? normaliseShopping(await decryptEnvelope<ShoppingFile>(base, shoppingKey))
            : emptyShoppingFile()
          mergedShopping = applyShoppingOps(current, entries)
          const envelope = await encryptEnvelope(mergedShopping, shoppingKey, kdf)
          files.push({ path: github.shoppingPath, text: `${JSON.stringify(envelope, null, 2)}\n` })
        }

        try {
          await commitFiles(github, token, { files, message: commitMessage(entries), parent })
        } catch (putError) {
          const conflict =
            putError instanceof GithubError && (putError.status === 409 || putError.status === 422)
          if (conflict && attempt === 0) continue
          throw putError
        }

        /*
         * Escono dalla coda **le voci committate**, non la coda. Ciò che è
         * arrivato mentre il commit era in volo resta in attesa e va al giro
         * dopo; e va riapplicato sopra `merged`, altrimenti la spesa appena
         * inserita sparirebbe da sotto gli occhi di chi l'ha scritta.
         */
        const committed = new Set(entries.map((entry) => entry.entryId))
        const remaining = outboxRef.current.pending.filter((entry) => !committed.has(entry.entryId))
        persistOutbox({
          pending: remaining,
          settled: [...outboxRef.current.settled, ...entries],
        })
        if (merged) setDataset(applyOps(merged, remaining))
        if (mergedConfig) {
          const withLocal = applyConfigOps(mergedConfig, remaining)
          configRef.current = withLocal
          setConfig(withLocal)
        }
        if (mergedCards) setCards(applyCardOps(mergedCards, remaining))
        if (mergedShopping) setShopping(applyShoppingOps(mergedShopping, remaining))
        setSync(
          remaining.length === 0
            ? { phase: 'idle', pending: 0, lastSyncAt: Date.now() }
            : { phase: 'syncing', pending: remaining.length, lastSyncAt: Date.now() },
        )
        return
      }
    } catch (syncError) {
      setSync({
        phase: 'error',
        pending: outboxRef.current.pending.length,
        lastError: describeError(syncError),
      })
    }
  }, [persistOutbox])

  /**
   * Un giro alla volta, e si ripete finché la coda si svuota.
   *
   * Il guard esiste perché `flush` è esposto **direttamente** come `syncNow`: il
   * pulsante in Impostazioni e il timer del debounce possono partire insieme, e
   * due giri in parallelo leggono la stessa testa, costruiscono lo stesso commit
   * e uno dei due si prende un 422 per il proprio conflitto.
   *
   * Il ciclo esiste per la coda che cresce durante il volo: quelle voci restano
   * in attesa (vedi `flushOnce`) e senza un secondo giro aspetterebbero
   * l'inserimento successivo per partire. Si ferma appena la coda è vuota o
   * appena un giro non ne fa uscire **nessuna di quelle che c'erano** — un
   * errore lascia ogni identità al suo posto, e senza quel confronto girerebbe
   * per sempre. Sul **numero** non funziona, e il perché sta nel commento
   * dentro il ciclo: non riscriverlo come «se la coda non si è accorciata».
   */
  const flush = useCallback(async (): Promise<void> => {
    if (flushing.current) {
      /* Il secondo chiamante non accoda niente — le sue operazioni sono già in
         coda e il ciclo qui sotto le troverà — ma non esce **muto**: chi ha
         premuto «Salva adesso» deve vedere che qualcosa sta succedendo, o legge
         un pulsante che non fa niente. È l'invariante di ADR-0043. */
      setSync((state) => ({ ...state, phase: 'syncing' }))
      return
    }
    flushing.current = true
    try {
      for (;;) {
        /*
         * Il progresso si misura sulle **identità**, non sul numero.
         *
         * Contare era sbagliato e in modo insidioso: `after >= before` legge
         * «la coda non si è accorciata» come «non è stato fatto niente», e le
         * due cose divergono proprio nel caso normale. Il debounce scatta 1,2 s
         * dopo il **primo** salvataggio, quindi il commit in volo porta di
         * solito **una** operazione: ne arriva una mentre vola, il commit
         * riesce, la coda resta lunga uno — e il ciclo si fermava lasciandola
         * lì, con `syncing` acceso e nessun timer armato. Bastava un salvataggio
         * in mezzo, che è il flusso che ADR-0070 dice di voler proteggere.
         *
         * Sulle identità la domanda è quella giusta: è uscita almeno una delle
         * voci che c'erano prima? Se no, non si è mosso niente — un errore
         * lascia tutte le identità al loro posto — e si esce.
         */
        const before = outboxRef.current.pending.map((entry) => entry.entryId)
        if (before.length === 0) break
        await flushOnce()
        const ancora = new Set(outboxRef.current.pending.map((entry) => entry.entryId))
        if (before.every((id) => ancora.has(id))) break
      }
    } finally {
      flushing.current = false
    }
  }, [flushOnce])

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current !== undefined) window.clearTimeout(flushTimer.current)
    flushTimer.current = window.setTimeout(() => {
      flushTimer.current = undefined
      void flush()
    }, SYNC_DEBOUNCE_MS)
  }, [flush])

  // ── Sblocco ─────────────────────────────────────────────────────────────
  const applyUnlocked = useCallback(
    (
      nextConfig: AppConfig,
      rawDataset: Dataset,
      rawCards: CardsFile | undefined,
      rawShopping: ShoppingFile | undefined,
    ) => {
      const box = loadOutbox()
      const queued = [...box.settled, ...box.pending]
      const withLocal = applyOps(rawDataset, queued)
      /* Anche la configurazione porta l'overlay locale: una categoria appena
         creata deve esistere già mentre il commit è ancora in volo, altrimenti
         le spese che le assegni puntano a un id che l'app non conosce. */
      const configWithLocal = applyConfigOps(nextConfig, queued)
      /* E anche le carte: una carta appena aggiunta si deve poter aprire alla
         cassa **subito**, non quando il commit atterra. Il file può non esserci
         ancora, e allora l'overlay parte da un file vuoto. */
      const cardsWithLocal = applyCardOps(rawCards ?? emptyCardsFile(), queued)
      /* E la lista: una cosa spuntata alla cassa deve restare spuntata anche se
         il commit è ancora in volo, o l'elenco la rimetterebbe fra quelle da
         prendere davanti alla cassiera. */
      const shoppingWithLocal = applyShoppingOps(rawShopping ?? emptyShoppingFile(), queued)
      const pruned = pruneSettled(
        box,
        {
          dataset: rawDataset,
          config: nextConfig,
          cards: rawCards?.cards,
          shopping: rawShopping?.items,
        },
        Date.now(),
      )
      persistOutbox(pruned)

      configRef.current = configWithLocal
      setConfig(configWithLocal)
      setDataset(withLocal)
      setCards(cardsWithLocal)
      setShopping(shoppingWithLocal)

      const available = monthsOf(withLocal.expenses)
      const today = currentMonthKey()
      const fallback = available.at(-1) ?? today
      setMonth(available.includes(today) ? today : fallback)
      setStatus('ready')
      setSync((s) => ({ ...s, pending: pruned.pending.length }))
      if (pruned.pending.length > 0) scheduleFlush()
    },
    [persistOutbox, scheduleFlush],
  )

  const doUnlock = useCallback(
    async (passphrase: string, envs: Envelopes, remember: boolean): Promise<void> => {
      setStatus('unlocking')
      setError(undefined)
      try {
        const dataKey = await deriveKeyCached(passphrase, envs.data.kdf)
        const rawDataset = normaliseDataset(await decryptEnvelope<Dataset>(envs.data, dataKey))
        const nextConfig = await decryptEnvelope<AppConfig>(
          envs.config,
          await deriveKeyCached(passphrase, envs.config.kdf),
        )
        const rawCards = await decryptCards(envs.cards, passphrase)
        const rawShopping = await decryptShopping(envs.shopping, passphrase)

        passphraseRef.current = passphrase
        kdfRef.current = envs.data.kdf
        if (remember) {
          try {
            localStorage.setItem(PASSPHRASE_KEY, passphrase)
            setHasStoredPassphrase(true)
          } catch {
            // niente storage: la passphrase resta solo in memoria
          }
        }
        applyUnlocked(nextConfig, rawDataset, rawCards, rawShopping)
      } catch (unlockError) {
        if (unlockError instanceof WrongPassphraseError) {
          try {
            localStorage.removeItem(PASSPHRASE_KEY)
          } catch {
            /* ignora */
          }
          setHasStoredPassphrase(false)
          setStatus('locked')
          setError(unlockError.message)
          return
        }
        setStatus('error')
        setError(describeError(unlockError))
      }
    },
    [applyUnlocked],
  )

  // ── Rilettura silenziosa e novità ───────────────────────────────────────

  /**
   * Rilegge i dati dal repo **senza far scattare niente di visibile**.
   *
   * Il pericolo qui è uno solo, e vale la pena scriverlo: sostituire il dataset
   * con quello remoto farebbe **sparire da sotto gli occhi** le spese ancora in
   * coda, che nel repo non ci sono ancora. La cura è la stessa che `flush` usa
   * per il commit — riapplicare la coda sopra ciò che si è appena letto — ed è
   * per questo che qui si passa da `applyOps` con `settled` e `pending` esatti
   * come fa `applyUnlocked`, invece di un `setDataset(remoto)`.
   *
   * Quello che **non** fa, di proposito: non tocca `status`, così non compare il
   * cancello; non tocca il mese scelto, perché stavi guardando marzo e devi
   * continuare a guardare marzo; e se fallisce non dice niente e non cambia
   * niente — una rilettura andata male lascia i dati di prima, che sono validi.
   */
  const refreshData = useCallback(async () => {
    const passphrase = passphraseRef.current
    if (passphrase === undefined) return

    /*
     * Nessun blocco mentre un commit è in volo, ed è deliberato: la rilettura
     * riapplica comunque la coda, quindi leggere il file un istante prima che
     * il commit atterri dà lo stesso contenuto — quello remoto più ciò che è in
     * attesa, cioè quello che si sta scrivendo. Un guard qui non aggiungerebbe
     * correttezza, aggiungerebbe uno stato da tenere allineato.
     */
    const now = Date.now()
    if (now - lastRefresh.current < REFRESH_EVERY_MS) return
    lastRefresh.current = now

    try {
      const envs = await fetchAllEnvelopes()
      const { data, config: cfg } = envs
      setEnvelopes(envs)
      kdfRef.current = data.kdf

      const key = await deriveKeyCached(passphrase, data.kdf)
      const rawDataset = normaliseDataset(await decryptEnvelope<Dataset>(data, key))
      /* Nessuna scorciatoia scritta a mano: `deriveKeyCached` è memoizzata su
         salt, iterazioni e digest, quindi con la stessa `kdf` non deriva due
         volte. La scorciatoia che c'era confrontava **solo il salt**, mentre
         `doUnlock` confrontava anche le iterazioni: con due file a iterazioni
         diverse questa rilettura decifrava la configurazione con la chiave del
         dataset, falliva con un `WrongPassphraseError`, e il `catch` qui sotto
         lo ingoiava — campanella e aggiornamento in sottofondo muti, senza un
         segno. Due espressioni della stessa condizione prima o poi dicono cose
         diverse: qui non ce n'è nessuna. */
      const nextConfig = await decryptEnvelope<AppConfig>(
        cfg,
        await deriveKeyCached(passphrase, cfg.kdf),
      )

      /*
       * La versione remota **pura**, prima dell'overlay locale: è il termine di
       * paragone per sapere cosa ha fatto l'altra persona. Confrontare i dataset
       * con l'overlay dentro conterebbe anche le proprie spese in coda.
       */
      const previousRemote = lastRemote.current
      lastRemote.current = rawDataset

      const rawCards = await decryptCards(envs.cards, passphrase)
      const rawShopping = await decryptShopping(envs.shopping, passphrase)

      const box = loadOutbox()
      const queued = [...box.settled, ...box.pending]
      const merged = applyOps(rawDataset, queued)
      const mergedConfig = applyConfigOps(nextConfig, queued)
      freeDiff.current = previousRemote ? { before: previousRemote, after: rawDataset } : undefined

      configRef.current = mergedConfig
      setConfig(mergedConfig)
      setDataset(merged)
      setCards(applyCardOps(rawCards ?? emptyCardsFile(), queued))
      setShopping(applyShoppingOps(rawShopping ?? emptyShoppingFile(), queued))
    } catch {
      /* Rilettura fallita: si tiene ciò che c'è. Non è un guasto da mostrare. */
    }
  }, [])

  /**
   * Rilegge la lista **dall'API di GitHub**, non dal sito.
   *
   * Perché serve: con una spunta per commit i deploy di Pages stanno in coda uno
   * alla volta (misurati il 03/09/2026: 31–51 s l'uno, `concurrency` con
   * `cancel-in-progress: false`), quindi durante una spesa il sito resta
   * indietro di minuti e le spunte dell'altra persona non arriverebbero. Le
   * proprie si vedono comunque, perché la coda locale si riapplica sopra: a
   * mancare è solo ciò che ha fatto l'altro, che è esattamente il caso per cui
   * una lista condivisa esiste. → ADR-0090
   *
   * Non sostituisce niente: all'apertura i quattro envelope arrivano dal sito
   * come sempre. Questa è una freschezza **in più**, che la pagina della lista
   * chiede finché è aperta.
   */
  const refreshShopping = useCallback(async (): Promise<ProbeResult> => {
    const github = configRef.current?.github
    const passphrase = passphraseRef.current
    /* Senza repo o senza passphrase non c'è niente da sondare, e non è un
       guasto: sono gli stessi stati in cui l'app non scrive. */
    if (!github?.shoppingPath || passphrase === undefined) return 'no-token'
    const token = loadToken()
    /*
     * **Senza token non si sonda.** Il limite senza autenticazione è di sessanta
     * richieste all'ora per indirizzo IP, e la campanella già le consuma:
     * finirle la rende muta senza poterlo spiegare, che è il difetto di
     * ADR-0053. Meglio una lista vecchia di qualche minuto che una campanella
     * spenta — e la pagina lo dice, invece di lasciar credere a un aggiornamento
     * che non avviene.
     */
    if (!token) return 'no-token'
    try {
      const file = await getFile(github, token, github.shoppingPath)
      /* Il file non c'è ancora: è lo stato normale finché nessuno ha scritto
         niente, e non c'è niente da aggiornare. La sonda è andata bene. */
      if (!file) return 'ok'
      const parsed: unknown = JSON.parse(file.text)
      if (!isEnvelope(parsed)) return 'failed'
      const key = await deriveKeyCached(passphrase, parsed.kdf)
      const remote = normaliseShopping(await decryptEnvelope<ShoppingFile>(parsed, key))
      const box = loadOutbox()
      setShopping(applyShoppingOps(remote, [...box.settled, ...box.pending]))
      return 'ok'
    } catch {
      /*
       * Una sonda fallita **non svuota la lista**: si tiene ciò che si ha. Un
       * elenco vuoto per una lettura andata male è indistinguibile da uno vuoto
       * perché non c'è niente da comprare, e la seconda cosa è rassicurante
       * mentre la prima non lo è. → ADR-0053
       */
      return 'failed'
    }
  }, [])

  /** L'unico posto che scrive un dettaglio: ref per la lettura, stato per il render. */
  const putDetail = useCallback((sha: string, detail: NewsDetail) => {
    detailCache.current.set(sha, detail)
    setDetails(new Map(detailCache.current))
  }, [])

  /**
   * Scarica lo storico dei commit e lo traduce in novità.
   *
   * Il token è facoltativo — il repo è pubblico — ma se c'è si impara anche il
   * proprio login, una volta sola, per non contarsi da soli fra le novità.
   */
  const loadNews = useCallback(async (groups: readonly ChangeGroup[]) => {
    const github = configRef.current?.github
    if (!github) return

    /*
     * **Spente vuol dire spente.** Con nessun gruppo acceso non c'è niente da
     * mostrare, e chiedere comunque la lista dei commit a ogni apertura
     * sarebbe lavoro per un risultato che si butta — oltre a consumare il
     * limite di richieste di chi ha deciso di non volerle. È questo a rendere
     * lecito il caricamento anticipato: si paga solo se si vuole. → ADR-0054
     *
     * Sta **sopra** `lastNews.current = now`: sotto, riaccendere un gruppo
     * troverebbe un «già letto un attimo fa» che non è mai avvenuto e la
     * campanella resterebbe muta fino a un minuto.
     *
     * L'elenco si sostituisce solo se c'era qualcosa: `loadNews` scatta a ogni
     * ritorno in primo piano — `visibilitychange` **e** `focus` — e un array
     * vuoto nuovo di zecca sarebbe un render dell'intero albero per niente.
     */
    if (groups.length === 0) {
      setChanges((precedenti) => (precedenti.length === 0 ? precedenti : []))
      setNewsError(undefined)
      return
    }

    /*
     * Non più di una lettura al minuto, come la rilettura dei dati.
     *
     * Senza, ogni ritorno in primo piano ne faceva **due**: `visibilitychange`
     * e `focus` scattano tutti e due, e questa non aveva la guardia che
     * `refreshData` ha. La lista pesa 173 KB e senza token il limite di GitHub
     * è 60 richieste all'ora per indirizzo IP: trenta passaggi fra le app e la
     * campanella si zittiva, senza poterlo spiegare.
     */
    const now = Date.now()
    if (now - lastNews.current < REFRESH_EVERY_MS) return
    lastNews.current = now

    const token = loadToken()
    setNewsLoading(true)
    try {
      let login = loadLogin() ?? undefined
      if (login === undefined && token) {
        const found = await viewerLogin(token)
        if (found) {
          saveLogin(found)
          login = found
        }
      }
      setMyLogin(login)
      const raw = await listCommits(github, token)
      rawCommits.current = raw
      const next = parseChanges(raw, { myLogin: login, groups })

      /*
       * Il caso gratuito. Confrontando **tutti** gli sha, non solo quelli
       * visibili: se fossero arrivati un commit mio e uno suo, il confronto che
       * ho in mano coprirebbe tutti e due e attribuirlo al suo direbbe il falso.
       * Uno solo, e allora quel confronto è esattamente il suo dettaglio.
       */
      const before = knownShas.current
      const allShas = new Set(raw.map((commit) => commit.sha))
      if (before !== undefined && freeDiff.current !== undefined) {
        const fresh = [...allShas].filter((sha) => !before.has(sha))
        const only = fresh.length === 1 ? next.find((change) => change.sha === fresh[0]) : undefined
        if (only) {
          putDetail(only.sha, {
            state: 'done',
            deltas: diffExpenses(freeDiff.current.before, freeDiff.current.after),
          })
        }
      }
      knownShas.current = allShas
      freeDiff.current = undefined
      setChanges(next)
      setNewsError(undefined)
    } catch (newsFailure) {
      /* Dirlo invece di ingoiarlo; il perché sta in `NewsState.error`. → ADR-0053 */
      setNewsError(describeError(newsFailure))
    } finally {
      setNewsLoading(false)
    }
  }, [putDetail])

  /**
   * Il dettaglio di un commit: quali spese ha toccato, con titolo e importo.
   *
   * Scarica il file cifrato **a quel commit** e a quello prima, li decifra e li
   * confronta. È l'unico modo di saperlo: nel messaggio di commit non ci può
   * stare, perché il repo è pubblico e ciò che finisce lì è in chiaro per
   * chiunque, per sempre. → ADR-0051
   *
   * Due file da 359 KB per commit, quindi si fa **a richiesta** e si tiene: la
   * cache non scade perché un commit passato non cambia mai.
   */
  const loadDetail = useCallback(async (change: Change): Promise<void> => {
    const already = detailCache.current.get(change.sha)
    if (already && already.state !== 'failed') return

    const github = configRef.current?.github
    const passphrase = passphraseRef.current
    const fail = (reason: string) => {
      putDetail(change.sha, { state: 'failed', reason })
    }
    /*
     * **Un commit che non tocca le spese non ha un dettaglio da leggere.**
     * Uscire prima è tutta la cura: due file da 367 kB per un confronto vuoto
     * per costruzione. Non è un guasto, quindi non si scrive nessuno stato —
     * `noticesOf` non produce righe di spesa per un commit così, quindi nessuna
     * riga resta ad aspettare. → ADR-0087
     */
    if (!touchesExpenses(change)) return
    if (!github) return fail('Manca la configurazione del repo.')
    if (passphrase === undefined) return fail('I dati sono bloccati: serve la passphrase.')
    if (change.parent === null) return fail('È il primo commit: non c’è niente con cui confrontarlo.')

    putDetail(change.sha, { state: 'loading' })

    const token = loadToken()
    const read = async (ref: string): Promise<Dataset | undefined> => {
      const cached = fileCache.current.get(ref)
      if (cached) return cached
      const file = await getFile(github, token, github.dataPath, ref)
      if (!file) return undefined
      const parsed: unknown = JSON.parse(file.text)
      if (!isEnvelope(parsed)) return undefined
      const key = await deriveKeyCached(passphrase, parsed.kdf)
      const decrypted = normaliseDataset(await decryptEnvelope<Dataset>(parsed, key))
      /* Il più vecchio esce quando la cache è piena: `Map` conserva l'ordine
         d'inserimento, quindi la prima chiave è la meno recente. */
      if (fileCache.current.size >= MAX_CACHED_VERSIONS) {
        const oldest = fileCache.current.keys().next().value
        if (oldest !== undefined) fileCache.current.delete(oldest)
      }
      fileCache.current.set(ref, decrypted)
      return decrypted
    }

    try {
      /* In fila e non in parallelo: due novità consecutive vogliono lo stesso
         file, e in parallelo lo scaricherebbero tutte e due prima che la cache
         se ne accorga. */
      const after = await read(change.sha)
      const before = await read(change.parent)
      if (!after || !before) return fail('In quel commit il file dei dati non c’era.')
      putDetail(change.sha, { state: 'done', deltas: diffExpenses(before, after) })
    } catch (detailError) {
      fail(
        detailError instanceof WrongPassphraseError
          ? 'Quel commit è cifrato con un’altra passphrase.'
          : describeError(detailError),
      )
    }
  }, [putDetail])

  /**
   * Segna letto fino **all'ultima novità conosciuta**, non a «adesso».
   *
   * Con «adesso» un commit arrivato un istante prima con l'orologio di GitHub
   * appena indietro verrebbe inghiottito senza essere mai stato mostrato.
   * Ancorandosi al commit più recente che ho davvero in mano, ciò che è visto è
   * visto e ciò che arriva dopo resta nuovo, qualunque cosa facciano gli
   * orologi.
   */
  /**
   * Il segno che sposta l'uno o l'altro, con la stessa cautela.
   *
   * **Senza novità in mano non si dichiara niente.** Il ripiego su «adesso» che
   * c'era prima perdeva le novità in silenzio: la campanella è tappabile appena
   * l'app è pronta, e se la si apriva nei ~350 ms in cui l'elenco dei commit
   * stava ancora arrivando, il segnalibro si piantava sull'ora corrente. Quando
   * la lista atterrava, un istante dopo, ogni commit risultava più vecchio del
   * segnalibro e quindi già visto — senza che il pallino fosse mai comparso. Un
   * momento di distrazione cancellava novità che nessuno aveva visto.
   *
   * E il segno non torna mai indietro: due dispositivi hanno due orologi.
   */
  const avanzaSegno = useCallback(
    (setter: Dispatch<SetStateAction<string | undefined>>, key: string) => {
      setChanges((current) => {
        const newest = current[0]?.at
        if (newest === undefined) return current
        setter((previous) => {
          const next = previous !== undefined && previous > newest ? previous : newest
          try {
            localStorage.setItem(key, next)
          } catch {
            /* senza storage il segno torna alla prossima apertura */
          }
          return next
        })
        return current
      })
    },
    [],
  )

  /**
   * **Guardate.** Chiudere il foglio spegne il pallino e non tocca l'elenco:
   * ciò che si è letto resta lì finché non lo si archivia. → ADR-0061
   */
  const markNewsRead = useCallback(() => {
    avanzaSegno(setNewsReadAt, NEWS_READ_KEY)
  }, [avanzaSegno])

  /**
   * **Archiviate.** Il pulsante svuota l'elenco — e con lui il pallino, perché
   * ciò che non c'è più non può essere da leggere.
   */
  const markNewsSeen = useCallback(() => {
    avanzaSegno(setNewsSeenAt, NEWS_SEEN_KEY)
    avanzaSegno(setNewsReadAt, NEWS_READ_KEY)
  }, [avanzaSegno])


  const setNewsGroups = useCallback(
    (groups: readonly ChangeGroup[]) => {
      const next = CHANGE_GROUPS.filter((group) => groups.includes(group))
      setNewsGroupsState(next)
      try {
        /* Si scrivono gli **spenti**: così un gruppo aggiunto domani nasce
           acceso invece di mancare da una lista scritta oggi. */
        const off = CHANGE_GROUPS.filter((group) => !next.includes(group))
        localStorage.setItem(NEWS_GROUPS_KEY, JSON.stringify(off))
      } catch {
        /* la preferenza vale per questa sessione */
      }
      /*
       * Rifiltra ciò che è già in mano invece di riscaricare: cambiare una
       * spunta non cambia i commit, cambia quali si guardano. E riscaricare
       * consumerebbe il limite di richieste per un'informazione che non è
       * cambiata.
       */
      setChanges(parseChanges(rawCommits.current, { myLogin, groups: next }))
    },
    [myLogin],
  )

  /*
   * Quando l'app torna in primo piano: rilegge i dati e le novità. È il momento
   * in cui il telefono è stato in tasca mentre l'altra persona registrava la
   * spesa, ed è l'unico modo che un sito statico ha di accorgersene.
   */
  useEffect(() => {
    if (status !== 'ready') return
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      void refreshData()
      void loadNews(newsGroups)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [loadNews, newsGroups, refreshData, status])

  /* Il primo caricamento delle novità, appena i dati sono aperti. */
  useEffect(() => {
    if (status !== 'ready') return
    void loadNews(newsGroups)
  }, [loadNews, newsGroups, status])

  // ── Boot: scarica i due file cifrati ────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setStatus('boot')
    setError(undefined)
    void (async () => {
      try {
        const envs = await fetchAllEnvelopes()
        if (cancelled) return
        setEnvelopes(envs)
        let stored: string | null = null
        try {
          stored = localStorage.getItem(PASSPHRASE_KEY)
        } catch {
          stored = null
        }
        setHasStoredPassphrase(stored !== null)
        if (stored) await doUnlock(stored, envs, false)
        else setStatus('locked')
      } catch (bootError) {
        if (cancelled) return
        setStatus('error')
        setError(
          `Non riesco a leggere i dati cifrati (${describeError(bootError)}). ` +
            'Se è la prima volta: `npm run seed && npm run encrypt`.',
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [doUnlock, reloadToken])

  // ── Azioni esposte ──────────────────────────────────────────────────────
  const unlock = useCallback(
    async (passphrase: string, remember: boolean): Promise<void> => {
      if (!envelopes) return
      await doUnlock(passphrase, envelopes, remember)
    },
    [doUnlock, envelopes],
  )

  const lock = useCallback(() => {
    passphraseRef.current = undefined
    configRef.current = undefined
    try {
      localStorage.removeItem(PASSPHRASE_KEY)
    } catch {
      /* ignora */
    }
    setHasStoredPassphrase(false)
    setConfig(undefined)
    setDataset(undefined)
    setCards(undefined)
    setStatus('locked')
  }, [])

  /*
   * Un solo punto di ingresso per tutte le scritture: la modifica compare subito
   * a schermo e parte verso il repo in sottofondo. Se il commit non riesce resta
   * in coda, quindi non c'è niente da annullare a mano.
   */
  const enqueue = useCallback(
    (op: Op) => {
      const entry = newEntry(op, Date.now())
      /*
       * **Due spunte che non sono ancora partite si annullano.** Toccare una cosa
       * e ritoccarla è il gesto sbagliato più frequente della cassa, e senza
       * questo lascerebbe nella storia pubblica «1 cosa presa, 1 cosa rimessa in
       * lista» per un dito scivolato. La regola sta in `pendingTwin`, con i suoi
       * test: qui si applica solo la sua risposta. → ADR-0091
       */
      /*
       * **Non mentre un commit vola.** `flushOnce` fa la sua fotografia della
       * coda e poi vola per uno o quattro secondi: togliere da `pending` una
       * voce che sta in quel commit vorrebbe dire che nel repo la cosa resta
       * presa, sul telefono no, e che non esiste più nessuna operazione che
       * rimetta le due parti d'accordo — alla rilettura successiva la cosa
       * torna fra le cose prese da sé. Con un commit in volo si accoda
       * normalmente: nella storia compare la coppia, che è la verità.
       */
      const gemella = flushing.current ? undefined : pendingTwin(outboxRef.current.pending, op)
      const next: OutboxState = {
        pending: gemella
          ? outboxRef.current.pending.filter((e) => e.entryId !== gemella.entryId)
          : [...outboxRef.current.pending, entry],
        settled: outboxRef.current.settled,
      }
      persistOutbox(next)
      setDataset((current) => (current ? applyOps(current, [entry]) : current))
      if (fileOf(entry) === 'cards') {
        /* Il file può non esistere ancora: la prima carta lo inventa qui e il
           salvataggio lo crea nel repo. Senza, la carta appena aggiunta non
           comparirebbe fino al commit. */
        setCards((current) => applyCardOps(current ?? emptyCardsFile(), [entry]))
      }
      if (fileOf(entry) === 'shopping') {
        /*
         * Lo stato locale si muove **anche quando la coda si annulla**: la vista
         * era avanti di una spunta, e l'annullamento la riporta dov'era il
         * remoto — che è esattamente ciò che questa riga fa applicando
         * l'operazione appena arrivata. Il file può non esistere ancora: la
         * prima voce lo inventa qui, e il salvataggio lo crea nel repo.
         */
        setShopping((current) => applyShoppingOps(current ?? emptyShoppingFile(), [entry]))
      }
      if (fileOf(entry) === 'config') {
        setConfig((current) => {
          if (!current) return current
          const nextConfig = applyConfigOps(current, [entry])
          /* Il ref è quello che legge `flush`, che gira fuori da React: se non lo
             si aggiorna qui, il salvataggio successivo partirebbe dalla
             configurazione di prima. */
          configRef.current = nextConfig
          return nextConfig
        })
      }
      setSync((s) => ({ ...s, pending: next.pending.length }))
      scheduleFlush()
    },
    [persistOutbox, scheduleFlush],
  )

  const annotate = useCallback(
    (expenseId: string, patch: Omit<Annotation, 'expenseId'>) => {
      enqueue({ kind: 'patch', expenseId, ...patch })
    },
    [enqueue],
  )

  const addExpense = useCallback((expense: Expense) => enqueue({ kind: 'create', expense }), [enqueue])

  const updateExpense = useCallback(
    (expenseId: string, fields: Partial<Expense>) => enqueue({ kind: 'update', expenseId, fields }),
    [enqueue],
  )

  const deleteExpense = useCallback(
    (expenseId: string) => enqueue({ kind: 'delete', expenseId }),
    [enqueue],
  )

  const addTricount = useCallback(
    (tricount: Tricount) => enqueue({ kind: 'tricount', tricount }),
    [enqueue],
  )

  const updateTricount = useCallback(
    (tricountId: string, fields: Partial<Tricount>) => enqueue({ kind: 'tricount-edit', tricountId, fields }),
    [enqueue],
  )

  const setCategories = useCallback(
    (categories: Category[]) => enqueue({ kind: 'categories', categories }),
    [enqueue],
  )

  const recategorize = useCallback(
    (from: string, to: string) => enqueue({ kind: 'recategorize', from, to }),
    [enqueue],
  )

  const setIncome = useCallback(
    (person: PersonId, profile: IncomeProfile) => enqueue({ kind: 'income', person, profile }),
    [enqueue],
  )

  const addSettlement = useCallback(
    (settlement: Settlement) => enqueue({ kind: 'settle', settlement }),
    [enqueue],
  )

  const removeSettlement = useCallback(
    (settlementId: string) => enqueue({ kind: 'unsettle', settlementId }),
    [enqueue],
  )

  const addPrice = useCallback((entry: PriceEntry) => enqueue({ kind: 'price', entry }), [enqueue])

  const deletePrice = useCallback(
    (priceId: string) => enqueue({ kind: 'price-delete', priceId }),
    [enqueue],
  )

  const addCard = useCallback((card: LoyaltyCard) => enqueue({ kind: 'card', card }), [enqueue])

  const updateCard = useCallback(
    (cardId: string, fields: Partial<LoyaltyCard>) => enqueue({ kind: 'card-edit', cardId, fields }),
    [enqueue],
  )

  const deleteCard = useCallback(
    (cardId: string) => enqueue({ kind: 'card-delete', cardId }),
    [enqueue],
  )

  // ── La lista della spesa ──────────────────────────────────────────────────
  const addItem = useCallback((item: ShoppingItem) => enqueue({ kind: 'list-add', item }), [enqueue])

  const updateItem = useCallback(
    (itemId: string, fields: Partial<ShoppingItem>) =>
      enqueue({ kind: 'list-edit', itemId, fields }),
    [enqueue],
  )

  /*
   * L'istante lo mette **chi accoda**, non chi applica: un'operazione che
   * leggesse l'orologio al momento di essere applicata darebbe un `takenAt`
   * diverso a ogni ricaricamento, e l'ordine dello storico cambierebbe sotto gli
   * occhi. → ADR-0088
   */
  const takeItem = useCallback(
    (itemId: string) => enqueue({ kind: 'list-take', itemId, at: new Date().toISOString() }),
    [enqueue],
  )

  const untakeItem = useCallback(
    (itemId: string) => enqueue({ kind: 'list-untake', itemId, at: new Date().toISOString() }),
    [enqueue],
  )

  const deleteItem = useCallback(
    (itemId: string) => enqueue({ kind: 'list-delete', itemId }),
    [enqueue],
  )


  /*
   * Si scrive una volta e non si riscrive. Il controllo guarda `localStorage` e
   * non lo stato di React: due schede aperte insieme condividono il primo e non
   * il secondo, e la garanzia deve valere anche là.
   */
  const chooseIdentity = useCallback((person: PersonId) => {
    if (readIdentity() !== undefined) return
    const today = todayIso()
    try {
      localStorage.setItem(PERSON_KEY, person)
      localStorage.setItem(IDENTITY_SINCE_KEY, today)
    } catch {
      /* Niente storage (navigazione privata): la scelta vale per questa sessione,
         e alla prossima apertura l'app la richiede. Meglio che indovinarla. */
    }
    setIdentity(person)
    setIdentitySince(today)
    setView((v) => ({ ...v, person }))
  }, [])

  const setIncludeVacations = useCallback((includeVacations: boolean) => {
    setView((v) => ({ ...v, includeVacations }))
  }, [])

  const setHideIncomeByDefault = useCallback((hidden: boolean) => {
    setDefaultHidden(hidden)
    setHideIncome(hidden)
    try {
      localStorage.setItem(HIDE_INCOME_KEY, hidden ? 'on' : 'off')
    } catch {
      /* niente storage: la scelta vale per questa sessione */
    }
  }, [])

  /**
   * Il velo si accende **per sempre** e si spegne **per un momento**.
   *
   * I due gesti non sono l'uno il contrario dell'altro, e trattarli uguali era
   * il difetto: **nascondere è una decisione**, scoprire è un atto momentaneo —
   * giri lo schermo verso qualcuno, poi vuoi che si richiuda da sé. Ricordare
   * anche lo scoprire lascerebbe l'app in chiaro per sempre dopo la prima
   * occhiata, che è l'opposto di quello che serve; non ricordare **nemmeno** il
   * nascondere obbligava a ripremerlo a ogni apertura, ed è quello che Alessio
   * ha chiesto di togliere.
   *
   * Per restare scoperti c'è la scelta esplicita in Impostazioni → Privacy: il
   * gesto raro sta in un posto raro. → ADR-0078, ADR-0066
   */
  const toggleHideIncome = useCallback(() => {
    if (hideIncome) setHideIncome(false)
    else setHideIncomeByDefault(true)
  }, [hideIncome, setHideIncomeByDefault])

  const reload = useCallback(() => {
    setReloadToken((n) => n + 1)
  }, [])

  useEffect(
    () => () => {
      if (flushTimer.current !== undefined) window.clearTimeout(flushTimer.current)
    },
    [],
  )

  const months = useMemo(() => (dataset ? monthsOf(dataset.expenses) : []), [dataset])

  /* Filtrato una volta: serve sia come elenco sia come conteggio del pallino. */
  const daLeggere = useMemo(() => unseenSince(changes, newsSeenAt), [changes, newsSeenAt])

  /**
   * Le righe della campanella, composte **qui** e non nel foglio.
   *
   * Il pallino si conta da queste, quindi elenco e conteggio devono nascere
   * nello stesso posto: prodotti in due punti diversi, prima o poi direbbero
   * cose diverse e sarebbe il pallino a mentire. Non è più la loro *lunghezza*
   * — è quante ne restano oltre il segno di lettura — ma la fonte è la stessa.
   * → ADR-0061, ADR-0052
   *
   * La visibilità si applica qui, dov'è nota la persona che guarda: ciò che sta
   * nei tricount di cui non sei membro non diventa una riga con un titolo, ma
   * **si conta lo stesso** in una riga che dice quante sono.
   */
  const notices = useMemo(
    () =>
      dataset === undefined
        ? []
        : noticesOf(daLeggere, (sha) => {
            const entry = details.get(sha)
            if (entry?.state === 'done') {
              return { deltas: visibleDeltas(entry.deltas, dataset.tricounts, view.person) }
            }
            return { failed: entry?.state === 'failed' }
          }),
    [daLeggere, dataset, details, view.person],
  )

  /* Il pallino: quante di quelle righe non sono ancora state guardate. La
     regola sta nel dominio, con i suoi test. → ADR-0061 */
  const unseen = useMemo(() => unseenCount(notices, newsReadAt), [notices, newsReadAt])

  /*
   * Il contenuto delle novità si carica da sé, senza aspettare che si apra la
   * campanella: è ciò che rende esatto il numero sul pallino.
   *
   * In fila e non in parallelo — novità consecutive condividono i file e la
   * cache per sha se ne accorge solo se le richieste non si accavallano — e
   * saltando ciò che ha già uno stato, altrimenti ogni rilettura della lista
   * rilancerebbe anche i tentativi falliti.
   */
  useEffect(() => {
    if (status !== 'ready') return
    let cancelled = false
    void (async () => {
      /* Filtrato **prima** dello slice: contando anche i commit senza spese,
         cinque novità di lista consumerebbero tutto il budget e il dettaglio
         della spesa vera non partirebbe. → ADR-0087 */
      for (const change of daLeggere.filter(touchesExpenses).slice(0, MAX_AUTO_DETAIL)) {
        if (cancelled) return
        if (detailCache.current.has(change.sha)) continue
        await loadDetail(change)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [daLeggere, loadDetail, status])

  const api = useMemo<StoreApi>(
    () => ({
      status,
      error,
      config,
      dataset,
      cards: cards?.cards ?? [],
      shopping: shopping?.items ?? [],
      months,
      month,
      view,
      sync: { ...sync, pending: outbox.pending.length },
      hasStoredPassphrase,
      news: {
        /*
         * **Solo le non lette.** La campanella non è un registro: contiene ciò
         * che non hai ancora svuotato, e dopo il pulsante è vuota finché non
         * arriva altro. Lo storico si legge da `git log`, che è dove sta.
         * → ADR-0052
         */
        changes: daLeggere,
        notices,
        unseen,
        groups: newsGroups,
        loading: newsLoading,
        error: newsError,
        knowsMe: myLogin !== undefined,
      },
      identity,
      identitySince,
      hideIncome,
      hideIncomeByDefault,
      unlock,
      lock,
      setMonth,
      chooseIdentity,
      setIncludeVacations,
      toggleHideIncome,
      setHideIncomeByDefault,
      annotate,
      addExpense,
      updateExpense,
      deleteExpense,
      addTricount,
      updateTricount,
      setCategories,
      recategorize,
      setIncome,
      addSettlement,
      removeSettlement,
      addPrice,
      deletePrice,
      addCard,
      updateCard,
      deleteCard,
      addItem,
      updateItem,
      takeItem,
      untakeItem,
      deleteItem,
      refreshShopping,
      syncNow: flush,
      reload,
      markNewsRead,
      markNewsSeen,
      setNewsGroups,
      loadNewsDetail: loadDetail,
      newsDetail: (sha: string) => details.get(sha),
    }),
    [
      changes,
      newsSeenAt,
      newsReadAt,
      unseen,
      newsGroups,
      newsLoading,
      newsError,
      myLogin,
      daLeggere,
      notices,
      loadDetail,
      details,
      markNewsRead,
      markNewsSeen,
      setNewsGroups,
      addCard,
      addExpense,
      addPrice,
      addSettlement,
      addTricount,
      cards,
      shopping,
      addItem,
      updateItem,
      takeItem,
      untakeItem,
      deleteItem,
      refreshShopping,
      deleteCard,
      deletePrice,
      updateCard,
      updateTricount,
      setCategories,
      recategorize,
      setIncome,
      annotate,
      removeSettlement,
      deleteExpense,
      updateExpense,
      config,
      dataset,
      error,
      flush,
      hasStoredPassphrase,
      hideIncome,
      hideIncomeByDefault,
      lock,
      month,
      months,
      outbox.pending.length,
      reload,
      setHideIncomeByDefault,
      setIncludeVacations,
      chooseIdentity,
      identity,
      identitySince,
      status,
      sync,
      toggleHideIncome,
      unlock,
      view,
    ],
  )

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore va usato dentro <StoreProvider>.')
  return ctx
}

export interface ReadyStore extends StoreApi {
  config: AppConfig
  dataset: Dataset
  identity: PersonId
}

/**
 * Per le pagine, montate solo quando i dati sono aperti **e** il dispositivo ha
 * detto di chi è.
 *
 * La seconda condizione è la guardia di ADR-0042: nessuna pagina può renderizzare
 * con l'identità di ripiego, quindi non esiste un modo di vedere i numeri di una
 * persona senza che qualcuno l'abbia scelta. È un'eccezione e non un ripiego
 * gentile di proposito — un ripiego qui sarebbe di nuovo «mostra Alessio».
 */
export function useReadyStore(): ReadyStore {
  const store = useStore()
  if (!store.config || !store.dataset) throw new Error('Dati non ancora disponibili.')
  if (!store.identity) throw new Error('Questo dispositivo non ha ancora detto di chi è.')
  return store as ReadyStore
}

/** Il mese selezionato esiste nei dati? Serve per i vuoti gentili. */
export function useMonthHasData(): boolean {
  const { dataset, month } = useStore()
  if (!dataset) return false
  return dataset.expenses.some((e) => monthKeyOf(e.date) === month)
}
