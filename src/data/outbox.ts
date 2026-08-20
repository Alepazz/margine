/**
 * Coda locale delle modifiche che l'app scrive nel repo.
 *
 * Non più solo annotazioni: da quando esiste il pulsante «+» la coda è un
 * **registro di operazioni** — crea, modifica, elimina, annota, aggiungi un
 * viaggio. Si applicano in ordine di tempo, così due tocchi sulla stessa spesa
 * finiscono nell'ordine in cui li hai fatti.
 *
 * Due code, non una:
 * - `pending`  → non ancora committate (offline, token scaduto, errore).
 * - `settled`  → già committate, ma GitHub Pages può metterci un minuto a
 *                ripubblicare: finché il file servito è quello vecchio, queste
 *                vanno riapplicate al caricamento, altrimenti una spesa appena
 *                aggiunta sembrerebbe sparita e riapparsa.
 *
 * Le voci `settled` si eliminano da sole quando il dato scaricato le contiene già.
 */

import { toCents } from '../domain/money'
import type {
  Annotation,
  AppConfig,
  Category,
  Dataset,
  Expense,
  IncomeProfile,
  PersonId,
  Settlement,
  Trip,
} from '../domain/types'

const STORAGE_KEY = 'margine.outbox.v2'
/** La coda di quando sapeva fare solo annotazioni: si converte, non si butta. */
const LEGACY_KEY = 'margine.outbox.v1'
const SETTLED_TTL_MS = 14 * 24 * 60 * 60 * 1000

export type Op =
  | ({ kind: 'patch' } & Annotation)
  | { kind: 'create'; expense: Expense }
  | { kind: 'update'; expenseId: string; fields: Partial<Expense> }
  | { kind: 'delete'; expenseId: string }
  | { kind: 'trip'; trip: Trip }
  | { kind: 'trip-edit'; tripId: string; fields: Partial<Trip> }
  | { kind: 'settle'; settlement: Settlement }
  | { kind: 'unsettle'; settlementId: string }
  /**
   * L'elenco **intero** delle categorie, nuovo. Non un delta: la tassonomia è
   * una lista ordinata in cui gli slot di colore devono restare coerenti fra
   * loro, e due delta applicati in ordine diverso darebbero due liste diverse.
   * Sostituirla per intero rende l'operazione idempotente per costruzione. → ADR-0024
   */
  | { kind: 'categories'; categories: Category[] }
  /** Le spese di una categoria passano a un'altra: è la controparte di una cancellazione. */
  | { kind: 'recategorize'; from: string; to: string }
  | { kind: 'income'; person: PersonId; profile: IncomeProfile }

/** Le operazioni che riscrivono `config.json.enc` invece di `expenses.json.enc`. */
export function touchesConfig(entry: Op): boolean {
  return entry.kind === 'categories' || entry.kind === 'income'
}

export type OutboxEntry = Op & { entryId: string; ts: number }

export interface OutboxState {
  pending: OutboxEntry[]
  settled: OutboxEntry[]
}

export const EMPTY_OUTBOX: OutboxState = { pending: [], settled: [] }

function isEntry(value: unknown): value is OutboxEntry {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<OutboxEntry>
  if (typeof v.entryId !== 'string' || typeof v.ts !== 'number') return false
  switch (v.kind) {
    case 'patch':
    case 'update':
    case 'delete':
      return typeof (v as { expenseId?: unknown }).expenseId === 'string'
    case 'create':
      return typeof (v as { expense?: { id?: unknown } }).expense?.id === 'string'
    case 'trip':
      return typeof (v as { trip?: { id?: unknown } }).trip?.id === 'string'
    case 'trip-edit':
      return typeof (v as { tripId?: unknown }).tripId === 'string'
    case 'settle':
      return typeof (v as { settlement?: { id?: unknown } }).settlement?.id === 'string'
    case 'unsettle':
      return typeof (v as { settlementId?: unknown }).settlementId === 'string'
    case 'categories': {
      /* Non vuoto: una tassonomia senza categorie non è uno stato che l'app sa
         produrre, quindi una voce così è spazzatura — e applicarla lascerebbe
         ogni spesa senza etichetta. */
      const list = (v as { categories?: unknown }).categories
      return Array.isArray(list) && list.length > 0
    }
    case 'recategorize': {
      const op = v as { from?: unknown; to?: unknown }
      return typeof op.from === 'string' && typeof op.to === 'string'
    }
    case 'income':
      return typeof (v as { profile?: { netMonthly?: unknown } }).profile?.netMonthly === 'number'
    default:
      return false
  }
}

/**
 * Converte la coda vecchia: ogni voce era un'annotazione, quindi diventa un
 * `patch`. Senza questo passaggio le modifiche ancora in attesa su un
 * dispositivo spariscono in silenzio al primo caricamento della versione nuova.
 */
function migrateLegacy(raw: string): OutboxState {
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null) return EMPTY_OUTBOX
  const convert = (list: unknown): OutboxEntry[] =>
    (Array.isArray(list) ? list : [])
      .map((item) => {
        if (typeof item !== 'object' || item === null) return null
        const v = item as Record<string, unknown>
        if (typeof v.entryId !== 'string' || typeof v.ts !== 'number') return null
        if (typeof v.expenseId !== 'string') return null
        return { ...v, kind: 'patch' } as OutboxEntry
      })
      .filter((entry): entry is OutboxEntry => entry !== null)
  const { pending, settled } = parsed as Record<string, unknown>
  return { pending: convert(pending), settled: convert(settled) }
}

export function loadOutbox(): OutboxState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null) return EMPTY_OUTBOX
      const { pending, settled } = parsed as Partial<OutboxState>
      return {
        pending: Array.isArray(pending) ? pending.filter(isEntry) : [],
        settled: Array.isArray(settled) ? settled.filter(isEntry) : [],
      }
    }
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (!legacy) return EMPTY_OUTBOX
    const migrated = migrateLegacy(legacy)
    saveOutbox(migrated)
    localStorage.removeItem(LEGACY_KEY)
    return migrated
  } catch {
    return EMPTY_OUTBOX
  }
}

export function saveOutbox(state: OutboxState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage pieno o disabilitato: le modifiche restano in memoria.
  }
}

let counter = 0

export function newEntry(op: Op, now: number): OutboxEntry {
  counter += 1
  return { ...op, entryId: `${now}-${counter}`, ts: now }
}

/** Applica le operazioni in ordine cronologico. */
export function applyOps(dataset: Dataset, entries: readonly OutboxEntry[]): Dataset {
  if (entries.length === 0) return dataset

  let expenses = dataset.expenses
  let trips = dataset.trips
  let settlements = dataset.settlements ?? []
  /* Copia solo se serve: il caso normale è una coda vuota o di soli patch. */
  let expensesTouched = false
  let tripsTouched = false
  let settlementsTouched = false

  const byId = new Map(expenses.map((e, index) => [e.id, index]))

  for (const entry of [...entries].sort((a, b) => a.ts - b.ts)) {
    switch (entry.kind) {
      case 'patch':
      case 'update': {
        const index = byId.get(entry.expenseId)
        if (index === undefined) break
        if (!expensesTouched) {
          expenses = [...expenses]
          expensesTouched = true
        }
        const current = expenses[index]
        if (!current) break
        expenses[index] =
          entry.kind === 'patch' ? applyPatch(current, entry) : normalize({ ...current, ...entry.fields })
        break
      }
      case 'create': {
        if (byId.has(entry.expense.id)) break
        if (!expensesTouched) {
          expenses = [...expenses]
          expensesTouched = true
        }
        byId.set(entry.expense.id, expenses.length)
        expenses.push(normalize(entry.expense))
        break
      }
      case 'delete': {
        if (!byId.has(entry.expenseId)) break
        expenses = expenses.filter((e) => e.id !== entry.expenseId)
        expensesTouched = true
        /* Gli indici sono cambiati: si rifà la mappa invece di tenerne una bugiarda. */
        byId.clear()
        expenses.forEach((e, index) => byId.set(e.id, index))
        break
      }
      case 'trip': {
        if (trips.some((t) => t.id === entry.trip.id)) break
        if (!tripsTouched) {
          trips = [...trips]
          tripsTouched = true
        }
        trips.push(entry.trip)
        break
      }
      case 'trip-edit': {
        const index = trips.findIndex((t) => t.id === entry.tripId)
        if (index < 0) break
        if (!tripsTouched) {
          trips = [...trips]
          tripsTouched = true
        }
        const current = trips[index]
        if (!current) break
        trips[index] = normalizeTrip({ ...current, ...entry.fields })
        break
      }
      case 'recategorize': {
        if (!expenses.some((e) => e.category === entry.from)) break
        expenses = expenses.map((e) =>
          e.category === entry.from
            ? /* La sottocategoria appartiene alla categoria di partenza: portarla
                 nella nuova la lascerebbe orfana, e l'interfaccia mostrerebbe un
                 id grezzo al posto di un'etichetta. */
              normalize({ ...e, category: entry.to, subcategory: undefined })
            : e,
        )
        /* `map` conserva ordine e lunghezza, quindi `byId` resta valida: non si
           ricostruisce come dopo un `delete`. */
        expensesTouched = true
        break
      }
      case 'settle': {
        if (settlements.some((s) => s.id === entry.settlement.id)) break
        if (!settlementsTouched) {
          settlements = [...settlements]
          settlementsTouched = true
        }
        settlements.push(entry.settlement)
        break
      }
      case 'unsettle': {
        if (!settlements.some((s) => s.id === entry.settlementId)) break
        settlements = settlements.filter((s) => s.id !== entry.settlementId)
        settlementsTouched = true
        break
      }
    }
  }

  if (!expensesTouched && !tripsTouched && !settlementsTouched) return dataset
  return { ...dataset, expenses, trips, settlements }
}

/**
 * Le operazioni che riscrivono la configurazione, applicate a parte.
 *
 * Sono un applicatore separato e non un ramo di `applyOps` perché lavorano su un
 * **altro file**: la configurazione e le spese vivono in due envelope cifrati
 * distinti, e mescolarli qui vorrebbe dire riscrivere ogni volta anche quello
 * che non è cambiato — con un IV nuovo a ogni cifratura, cioè un file diverso a
 * ogni salvataggio anche senza modifiche.
 */
export function applyConfigOps(config: AppConfig, entries: readonly OutboxEntry[]): AppConfig {
  let next = config
  for (const entry of [...entries].sort((a, b) => a.ts - b.ts)) {
    if (entry.kind === 'categories') {
      next = { ...next, categories: entry.categories }
    } else if (entry.kind === 'income') {
      next = { ...next, income: { ...next.income, [entry.person]: entry.profile } }
    }
  }
  return next
}

/** Come `normalize` per le spese: un flag falso non si scrive. */
function normalizeTrip(trip: Trip): Trip {
  const next: Trip = { ...trip }
  if (next.closed !== true) delete next.closed
  if (next.country !== undefined && next.country.trim() === '') delete next.country
  return next
}

function applyPatch(expense: Expense, patch: Annotation): Expense {
  const next: Expense = { ...expense }
  if (patch.tax730 !== undefined) next.tax730 = patch.tax730
  if (patch.notes !== undefined) next.notes = patch.notes
  if (patch.receiptLinks !== undefined) next.receiptLinks = patch.receiptLinks
  if (patch.welfare !== undefined) next.welfare = patch.welfare
  return normalize(next)
}

/**
 * Togliamo i campi vuoti: il JSON resta pulito e i diff leggibili.
 *
 * `subcategory` e `trip` cadono anche se sono la **stringa vuota**, e non è un
 * dettaglio: un `update` si applica come `{ ...spesa, ...campi }`, quindi un
 * campo assente vuol dire «lascia com'era» e per cancellarlo bisogna dire
 * qualcosa. Dire `undefined` non basta — `JSON.stringify` lo butta via, e la
 * coda vive in localStorage: bastava un ricaricamento perché una spesa portata
 * fuori da una vacanza si tenesse il suo `trip`, cioè un viaggio su una spesa
 * che non è più di vacanza. La stringa vuota sopravvive al salvataggio e vuol
 * dire «togli».
 */
function normalize(expense: Expense): Expense {
  const next: Expense = { ...expense }
  if (next.tax730 === false) delete next.tax730
  if (next.welfare === false) delete next.welfare
  if (next.notes !== undefined && next.notes.trim() === '') delete next.notes
  if (next.receiptLinks !== undefined && next.receiptLinks.length === 0) delete next.receiptLinks
  if (!next.subcategory) delete next.subcategory
  if (!next.trip) delete next.trip
  if (next.shares.others !== undefined && toCents(next.shares.others) === 0) {
    const { others: _drop, ...rest } = next.shares
    next.shares = rest
  }
  return next
}

function sameLinks(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  const left = a ?? []
  const right = b ?? []
  return left.length === right.length && left.every((v, i) => v === right[i])
}

/**
 * true quando ciò che è stato scaricato riflette già questa operazione.
 *
 * Vuole **entrambi** i file: da quando la coda tocca anche le categorie e le
 * entrate, guardare solo il dataset direbbe «non ancora applicata» per sempre a
 * un'operazione sulla configurazione, e quella voce resterebbe in coda a vita.
 */
export function isAlreadyApplied(
  dataset: Dataset,
  config: AppConfig | undefined,
  entry: OutboxEntry,
): boolean {
  switch (entry.kind) {
    case 'patch': {
      const expense = dataset.expenses.find((e) => e.id === entry.expenseId)
      if (!expense) return false
      if (entry.tax730 !== undefined && (expense.tax730 ?? false) !== entry.tax730) return false
      if (entry.notes !== undefined && (expense.notes ?? '') !== entry.notes.trim()) return false
      if (entry.receiptLinks !== undefined && !sameLinks(expense.receiptLinks, entry.receiptLinks))
        return false
      if (entry.welfare !== undefined && (expense.welfare ?? false) !== entry.welfare) return false
      return true
    }
    case 'create':
      return dataset.expenses.some((e) => e.id === entry.expense.id)
    case 'update': {
      const expense = dataset.expenses.find((e) => e.id === entry.expenseId)
      if (!expense) return false
      /* Si confronta con l'**intenzione normalizzata**, non col valore grezzo:
         `trip: ''` significa «togli il viaggio», e una spesa che non ce l'ha più
         soddisfa quell'operazione anche se le due stringhe non si somigliano. */
      const wanted = normalize({ ...expense, ...entry.fields })
      return Object.keys(entry.fields).every(
        (key) =>
          JSON.stringify(expense[key as keyof Expense]) ===
          JSON.stringify(wanted[key as keyof Expense]),
      )
    }
    case 'delete':
      return !dataset.expenses.some((e) => e.id === entry.expenseId)
    case 'trip':
      return dataset.trips.some((t) => t.id === entry.trip.id)
    case 'trip-edit': {
      const trip = dataset.trips.find((t) => t.id === entry.tripId)
      if (!trip) return false
      return Object.entries(entry.fields).every(
        ([key, value]) => JSON.stringify(trip[key as keyof Trip]) === JSON.stringify(value),
      )
    }
    case 'settle':
      return (dataset.settlements ?? []).some((s) => s.id === entry.settlement.id)
    case 'unsettle':
      return !(dataset.settlements ?? []).some((s) => s.id === entry.settlementId)
    case 'recategorize':
      return !dataset.expenses.some((e) => e.category === entry.from)
    case 'categories':
      /* Senza configurazione non si può dire: meglio «non ancora» — una voce di
         troppo si riapplica senza danno, una buttata via è persa. */
      if (!config) return false
      return JSON.stringify(config.categories) === JSON.stringify(entry.categories)
    case 'income': {
      if (!config) return false
      return JSON.stringify(config.income[entry.person]) === JSON.stringify(entry.profile)
    }
  }
}

/** Scarta le voci già pubblicate (o troppo vecchie per essere ancora in volo). */
export function pruneSettled(
  state: OutboxState,
  dataset: Dataset,
  config: AppConfig | undefined,
  now: number,
): OutboxState {
  const settled = state.settled.filter(
    (entry) => now - entry.ts < SETTLED_TTL_MS && !isAlreadyApplied(dataset, config, entry),
  )
  if (settled.length === state.settled.length) return state
  return { ...state, settled }
}

export function pendingCount(state: OutboxState): number {
  return state.pending.length
}

/** Riassunto per il messaggio di commit. */
export function describeOps(entries: readonly OutboxEntry[]): string {
  const counts = new Map<Op['kind'], number>()
  for (const entry of entries) counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1)
  const words: Record<Op['kind'], [string, string]> = {
    create: ['spesa aggiunta', 'spese aggiunte'],
    update: ['spesa corretta', 'spese corrette'],
    delete: ['spesa eliminata', 'spese eliminate'],
    patch: ['annotazione', 'annotazioni'],
    trip: ['viaggio nuovo', 'viaggi nuovi'],
    'trip-edit': ['viaggio modificato', 'viaggi modificati'],
    settle: ['rimborso registrato', 'rimborsi registrati'],
    unsettle: ['rimborso annullato', 'rimborsi annullati'],
    categories: ['categorie aggiornate', 'categorie aggiornate'],
    recategorize: ['categoria svuotata', 'categorie svuotate'],
    income: ['entrate aggiornate', 'entrate aggiornate'],
  }
  const parts: string[] = []
  for (const [kind, count] of counts) {
    const [one, many] = words[kind]
    parts.push(`${count} ${count === 1 ? one : many}`)
  }
  return parts.join(', ')
}
