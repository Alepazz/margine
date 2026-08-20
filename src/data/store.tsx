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
} from 'react'

import { currentMonthKey, monthKeyOf, type MonthKey } from '../domain/dates'
import { DEFAULT_VIEW, monthsOf, type ViewOptions } from '../domain/selectors'
import type { Annotation, AppConfig, Dataset, Expense, PersonId, Settlement, Trip } from '../domain/types'
import { WrongPassphraseError, decryptEnvelope, deriveKeyCached, encryptEnvelope } from './crypto'
import { isEnvelope, type Envelope } from './envelope'
import { GithubError, getFile, loadToken, putFile } from './github'
import {
  EMPTY_OUTBOX,
  applyOps,
  describeOps,
  loadOutbox,
  newEntry,
  pruneSettled,
  saveOutbox,
  type Op,
  type OutboxEntry,
  type OutboxState,
} from './outbox'

const DATA_URL = `${import.meta.env.BASE_URL}data/expenses.json.enc`
const CONFIG_URL = `${import.meta.env.BASE_URL}data/config.json.enc`
const PASSPHRASE_KEY = 'margine.passphrase.v1'
const PERSON_KEY = 'margine.person.v1'
/*
 * Come parte l'app su **questo** dispositivo, non nei dati: «questo telefono
 * parte coperto» è una proprietà del telefono. Nei dati non potrebbe stare
 * comunque — l'app scrive solo `expenses.json.enc`, non la configurazione.
 */
const HIDE_INCOME_KEY = 'margine.hideIncome.v1'
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
}

export interface StoreApi {
  status: Status
  error?: string
  config?: AppConfig
  dataset?: Dataset
  months: MonthKey[]
  month: MonthKey
  view: ViewOptions
  sync: SyncState
  hasStoredPassphrase: boolean
  /** Guadagni oscurati adesso. Il tocco vale per questa sessione. */
  hideIncome: boolean
  /** Come parte l'app su questo dispositivo: questo è ciò che resta. */
  hideIncomeByDefault: boolean
  unlock: (passphrase: string, remember: boolean) => Promise<void>
  lock: () => void
  setMonth: (month: MonthKey) => void
  setPerson: (person: PersonId) => void
  setIncludeVacations: (include: boolean) => void
  toggleHideIncome: () => void
  setHideIncomeByDefault: (hidden: boolean) => void
  annotate: (expenseId: string, patch: Omit<Annotation, 'expenseId'>) => void
  addExpense: (expense: Expense) => void
  updateExpense: (expenseId: string, fields: Partial<Expense>) => void
  deleteExpense: (expenseId: string) => void
  addTrip: (trip: Trip) => void
  addSettlement: (settlement: Settlement) => void
  removeSettlement: (settlementId: string) => void
  syncNow: () => Promise<void>
  reload: () => void
}

const StoreContext = createContext<StoreApi | null>(null)

async function fetchEnvelope(url: string): Promise<Envelope> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`)
  const parsed: unknown = await response.json()
  if (!isEnvelope(parsed)) throw new Error(`${url} non è un file cifrato di Margine.`)
  return parsed
}

/**
 * I file cifrati scritti prima di ADR-0019 non hanno `settlements`. Si normalizza
 * appena il dato entra, così il tipo dice la verità in tutto il resto dell'app
 * invece di costringere ogni lettore a un `?? []`.
 */
function normaliseDataset(raw: Dataset): Dataset {
  return raw.settlements ? raw : { ...raw, settlements: [] }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Errore sconosciuto.'
}

function commitMessage(entries: readonly OutboxEntry[]): string {
  return `${describeOps(entries)} (da Margine)`
}

function readHideIncomeDefault(): boolean {
  try {
    return localStorage.getItem(HIDE_INCOME_KEY) === 'on'
  } catch {
    return false
  }
}

function readStoredPerson(): PersonId {
  try {
    const raw = localStorage.getItem(PERSON_KEY)
    return raw === 'partner' ? 'partner' : 'me'
  } catch {
    return 'me'
  }
}

export function StoreProvider({ children }: { children: ReactNode }): ReactNode {
  const [status, setStatus] = useState<Status>('boot')
  const [error, setError] = useState<string | undefined>()
  const [envelopes, setEnvelopes] = useState<Envelopes | undefined>()
  const [config, setConfig] = useState<AppConfig | undefined>()
  const [dataset, setDataset] = useState<Dataset | undefined>()
  const [month, setMonth] = useState<MonthKey>(currentMonthKey())
  const [view, setView] = useState<ViewOptions>({ ...DEFAULT_VIEW, person: readStoredPerson() })
  const [outbox, setOutbox] = useState<OutboxState>(EMPTY_OUTBOX)
  const [sync, setSync] = useState<SyncState>({ phase: 'idle', pending: 0 })
  const [hasStoredPassphrase, setHasStoredPassphrase] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [hideIncomeByDefault, setDefaultHidden] = useState(readHideIncomeDefault)
  const [hideIncome, setHideIncome] = useState(readHideIncomeDefault)

  const passphraseRef = useRef<string | undefined>(undefined)
  const configRef = useRef<AppConfig | undefined>(undefined)
  const outboxRef = useRef<OutboxState>(EMPTY_OUTBOX)
  const flushTimer = useRef<number | undefined>(undefined)

  const persistOutbox = useCallback((next: OutboxState) => {
    outboxRef.current = next
    setOutbox(next)
    saveOutbox(next)
  }, [])

  // ── Sincronizzazione verso il repo ──────────────────────────────────────
  const flush = useCallback(async (): Promise<void> => {
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
    if (!passphrase) return

    setSync({ phase: 'syncing', pending: pending.length })
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const remote = await getFile(github, token)
        if (!remote) {
          throw new GithubError(404, `Nel repo non c'è ${github.dataPath}: fai un primo push dei dati.`)
        }
        const parsed: unknown = JSON.parse(remote.text)
        if (!isEnvelope(parsed)) throw new Error('Il file nel repo non è un file cifrato di Margine.')

        const key = await deriveKeyCached(passphrase, parsed.kdf)
        const remoteDataset = normaliseDataset(await decryptEnvelope<Dataset>(parsed, key))
        const entries = outboxRef.current.pending
        const merged = applyOps(
          { ...remoteDataset, updatedAt: new Date().toISOString() },
          entries,
        )
        const nextEnvelope = await encryptEnvelope(merged, key, parsed.kdf)

        try {
          await putFile(github, token, {
            text: `${JSON.stringify(nextEnvelope, null, 2)}\n`,
            sha: remote.sha,
            message: commitMessage(entries),
          })
        } catch (putError) {
          const conflict =
            putError instanceof GithubError && (putError.status === 409 || putError.status === 422)
          if (conflict && attempt === 0) continue
          throw putError
        }

        persistOutbox({ pending: [], settled: [...outboxRef.current.settled, ...entries] })
        setDataset(merged)
        setSync({ phase: 'idle', pending: 0, lastSyncAt: Date.now() })
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

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current !== undefined) window.clearTimeout(flushTimer.current)
    flushTimer.current = window.setTimeout(() => {
      flushTimer.current = undefined
      void flush()
    }, SYNC_DEBOUNCE_MS)
  }, [flush])

  // ── Sblocco ─────────────────────────────────────────────────────────────
  const applyUnlocked = useCallback(
    (nextConfig: AppConfig, rawDataset: Dataset) => {
      const box = loadOutbox()
      const withLocal = applyOps(rawDataset, [...box.settled, ...box.pending])
      const pruned = pruneSettled(box, rawDataset, Date.now())
      persistOutbox(pruned)

      configRef.current = nextConfig
      setConfig(nextConfig)
      setDataset(withLocal)

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
        const configKey =
          envs.config.kdf.salt === envs.data.kdf.salt && envs.config.kdf.iterations === envs.data.kdf.iterations
            ? dataKey
            : await deriveKeyCached(passphrase, envs.config.kdf)
        const nextConfig = await decryptEnvelope<AppConfig>(envs.config, configKey)

        passphraseRef.current = passphrase
        if (remember) {
          try {
            localStorage.setItem(PASSPHRASE_KEY, passphrase)
            setHasStoredPassphrase(true)
          } catch {
            // niente storage: la passphrase resta solo in memoria
          }
        }
        applyUnlocked(nextConfig, rawDataset)
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

  // ── Boot: scarica i due file cifrati ────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setStatus('boot')
    setError(undefined)
    void (async () => {
      try {
        const [data, cfg] = await Promise.all([fetchEnvelope(DATA_URL), fetchEnvelope(CONFIG_URL)])
        if (cancelled) return
        const envs: Envelopes = { data, config: cfg }
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
      const next: OutboxState = {
        pending: [...outboxRef.current.pending, entry],
        settled: outboxRef.current.settled,
      }
      persistOutbox(next)
      setDataset((current) => (current ? applyOps(current, [entry]) : current))
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

  const addTrip = useCallback((trip: Trip) => enqueue({ kind: 'trip', trip }), [enqueue])

  const addSettlement = useCallback(
    (settlement: Settlement) => enqueue({ kind: 'settle', settlement }),
    [enqueue],
  )

  const removeSettlement = useCallback(
    (settlementId: string) => enqueue({ kind: 'unsettle', settlementId }),
    [enqueue],
  )

  const setPerson = useCallback((person: PersonId) => {
    setView((v) => ({ ...v, person }))
    try {
      localStorage.setItem(PERSON_KEY, person)
    } catch {
      /* ignora */
    }
  }, [])

  const setIncludeVacations = useCallback((includeVacations: boolean) => {
    setView((v) => ({ ...v, includeVacations }))
  }, [])

  /*
   * Il tocco non si ricorda: se si ricordasse, la prima volta che scopri il
   * numero resteresti scoperto per sempre, che è l'opposto di quello che serve.
   * Quello che resta è il default, deciso nelle impostazioni.
   */
  const toggleHideIncome = useCallback(() => {
    setHideIncome((hidden) => !hidden)
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

  const api = useMemo<StoreApi>(
    () => ({
      status,
      error,
      config,
      dataset,
      months,
      month,
      view,
      sync: { ...sync, pending: outbox.pending.length },
      hasStoredPassphrase,
      hideIncome,
      hideIncomeByDefault,
      unlock,
      lock,
      setMonth,
      setPerson,
      setIncludeVacations,
      toggleHideIncome,
      setHideIncomeByDefault,
      annotate,
      addExpense,
      updateExpense,
      deleteExpense,
      addTrip,
      addSettlement,
      removeSettlement,
      syncNow: flush,
      reload,
    }),
    [
      addExpense,
      addSettlement,
      addTrip,
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
      setPerson,
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
}

/** Per le pagine, montate solo quando i dati sono aperti. */
export function useReadyStore(): ReadyStore {
  const store = useStore()
  if (!store.config || !store.dataset) throw new Error('Dati non ancora disponibili.')
  return store as ReadyStore
}

/** Il mese selezionato esiste nei dati? Serve per i vuoti gentili. */
export function useMonthHasData(): boolean {
  const { dataset, month } = useStore()
  if (!dataset) return false
  return dataset.expenses.some((e) => monthKeyOf(e.date) === month)
}
