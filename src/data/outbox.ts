/**
 * Coda locale delle annotazioni 730.
 *
 * Due code, non una:
 * - `pending`  → modifiche non ancora committate (offline, token scaduto, errore).
 * - `settled`  → già committate, ma GitHub Pages può metterci un minuto a
 *                ripubblicare: finché il file servito è quello vecchio, queste
 *                annotazioni vanno riapplicate al caricamento, altrimenti
 *                sembrerebbero sparite.
 *
 * Le voci `settled` si eliminano da sole quando il dato scaricato le contiene già.
 */

import type { Annotation, Dataset, Expense } from '../domain/types'

const STORAGE_KEY = 'margine.outbox.v1'
const SETTLED_TTL_MS = 14 * 24 * 60 * 60 * 1000

export interface OutboxEntry extends Annotation {
  entryId: string
  ts: number
}

export interface OutboxState {
  pending: OutboxEntry[]
  settled: OutboxEntry[]
}

export const EMPTY_OUTBOX: OutboxState = { pending: [], settled: [] }

function isEntry(value: unknown): value is OutboxEntry {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<OutboxEntry>
  return typeof v.entryId === 'string' && typeof v.expenseId === 'string' && typeof v.ts === 'number'
}

export function loadOutbox(): OutboxState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_OUTBOX
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_OUTBOX
    const { pending, settled } = parsed as Partial<OutboxState>
    return {
      pending: Array.isArray(pending) ? pending.filter(isEntry) : [],
      settled: Array.isArray(settled) ? settled.filter(isEntry) : [],
    }
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

export function newEntry(annotation: Annotation, now: number): OutboxEntry {
  counter += 1
  return { ...annotation, entryId: `${now}-${counter}`, ts: now }
}

/** Applica le patch a una spesa, in ordine cronologico. */
export function applyAnnotations(dataset: Dataset, entries: readonly OutboxEntry[]): Dataset {
  if (entries.length === 0) return dataset
  const byExpense = new Map<string, OutboxEntry[]>()
  for (const entry of [...entries].sort((a, b) => a.ts - b.ts)) {
    const bucket = byExpense.get(entry.expenseId)
    if (bucket) bucket.push(entry)
    else byExpense.set(entry.expenseId, [entry])
  }
  const expenses = dataset.expenses.map((expense) => {
    const patches = byExpense.get(expense.id)
    if (!patches) return expense
    return patches.reduce(applyOne, expense)
  })
  return { ...dataset, expenses }
}

function applyOne(expense: Expense, patch: Annotation): Expense {
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
  return next
}

function sameLinks(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  const left = a ?? []
  const right = b ?? []
  return left.length === right.length && left.every((v, i) => v === right[i])
}

/** true quando il dataset scaricato riflette già questa annotazione. */
export function isAlreadyApplied(dataset: Dataset, entry: OutboxEntry): boolean {
  const expense = dataset.expenses.find((e) => e.id === entry.expenseId)
  if (!expense) return false
  if (entry.tax730 !== undefined && (expense.tax730 ?? false) !== entry.tax730) return false
  if (entry.notes !== undefined && (expense.notes ?? '') !== entry.notes.trim()) return false
  if (entry.receiptLinks !== undefined && !sameLinks(expense.receiptLinks, entry.receiptLinks))
    return false
  if (entry.welfare !== undefined && (expense.welfare ?? false) !== entry.welfare) return false
  return true
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
