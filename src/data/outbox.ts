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
import type { Annotation, Dataset, Expense, Settlement, Trip } from '../domain/types'

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
  | { kind: 'settle'; settlement: Settlement }
  | { kind: 'unsettle'; settlementId: string }

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
    case 'settle':
      return typeof (v as { settlement?: { id?: unknown } }).settlement?.id === 'string'
    case 'unsettle':
      return typeof (v as { settlementId?: unknown }).settlementId === 'string'
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

function applyPatch(expense: Expense, patch: Annotation): Expense {
  const next: Expense = { ...expense }
  if (patch.tax730 !== undefined) next.tax730 = patch.tax730
  if (patch.notes !== undefined) next.notes = patch.notes
  if (patch.receiptLinks !== undefined) next.receiptLinks = patch.receiptLinks
  if (patch.welfare !== undefined) next.welfare = patch.welfare
  return normalize(next)
}

/** Togliamo i campi vuoti: il JSON resta pulito e i diff leggibili. */
function normalize(expense: Expense): Expense {
  const next: Expense = { ...expense }
  if (next.tax730 === false) delete next.tax730
  if (next.welfare === false) delete next.welfare
  if (next.notes !== undefined && next.notes.trim() === '') delete next.notes
  if (next.receiptLinks !== undefined && next.receiptLinks.length === 0) delete next.receiptLinks
  if (next.subcategory === undefined) delete next.subcategory
  if (next.trip === undefined) delete next.trip
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

/** true quando il dataset scaricato riflette già questa operazione. */
export function isAlreadyApplied(dataset: Dataset, entry: OutboxEntry): boolean {
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
      return Object.entries(entry.fields).every(
        ([key, value]) => JSON.stringify(expense[key as keyof Expense]) === JSON.stringify(value),
      )
    }
    case 'delete':
      return !dataset.expenses.some((e) => e.id === entry.expenseId)
    case 'trip':
      return dataset.trips.some((t) => t.id === entry.trip.id)
    case 'settle':
      return (dataset.settlements ?? []).some((s) => s.id === entry.settlement.id)
    case 'unsettle':
      return !(dataset.settlements ?? []).some((s) => s.id === entry.settlementId)
  }
}

/** Scarta le voci già pubblicate (o troppo vecchie per essere ancora in volo). */
export function pruneSettled(state: OutboxState, dataset: Dataset, now: number): OutboxState {
  const settled = state.settled.filter(
    (entry) => now - entry.ts < SETTLED_TTL_MS && !isAlreadyApplied(dataset, entry),
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
    settle: ['rimborso registrato', 'rimborsi registrati'],
    unsettle: ['rimborso annullato', 'rimborsi annullati'],
  }
  const parts: string[] = []
  for (const [kind, count] of counts) {
    const [one, many] = words[kind]
    parts.push(`${count} ${count === 1 ? one : many}`)
  }
  return parts.join(', ')
}
