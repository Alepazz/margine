import { describe, expect, it } from 'vitest'

import { applyOps, describeOps, isAlreadyApplied, pruneSettled, type OutboxEntry } from './outbox'
import type { Dataset, Expense } from '../domain/types'

const DATASET: Dataset = {
  version: 1,
  updatedAt: '2026-08-19T09:00:00.000Z',
  expenses: [
    {
      id: 'a',
      date: '2026-08-01',
      title: 'Veterinario',
      amount: 90,
      shares: { me: 45, partner: 45 },
      paidBy: 'me',
      source: 'condivise',
      category: 'gatto',
      recurring: false,
    },
  ],
  trips: [],
  settlements: [],
}

/** Un'annotazione, che è il caso storico e resta il più frequente. */
const patch = (fields: Record<string, unknown>, ts = 1): OutboxEntry =>
  ({ kind: 'patch', entryId: `e${ts}`, expenseId: 'a', ts, ...fields }) as OutboxEntry

const NUOVA: Expense = {
  id: 'b',
  date: '2026-08-20',
  title: 'Spesa Esselunga',
  amount: 47.3,
  shares: { me: 23.65, partner: 23.65 },
  paidBy: 'me',
  source: 'condivise',
  category: 'spesa',
  recurring: false,
}

describe('annotazioni', () => {
  it('applica tag, nota e scontrini', () => {
    const next = applyOps(DATASET, [
      patch({ tax730: true, notes: 'Ricevuta chiesta', receiptLinks: ['https://drive.google.com/x'] }),
    ])
    expect(next.expenses[0]?.tax730).toBe(true)
    expect(next.expenses[0]?.notes).toBe('Ricevuta chiesta')
    expect(next.expenses[0]?.receiptLinks).toEqual(['https://drive.google.com/x'])
  })

  it('non modifica il dataset originale', () => {
    applyOps(DATASET, [patch({ tax730: true })])
    expect(DATASET.expenses[0]?.tax730).toBeUndefined()
  })

  it('applica in ordine cronologico, non di inserimento', () => {
    const next = applyOps(DATASET, [patch({ notes: 'seconda' }, 20), patch({ notes: 'prima' }, 10)])
    expect(next.expenses[0]?.notes).toBe('seconda')
  })

  it('toglie i campi svuotati invece di lasciarli vuoti nel file', () => {
    const tagged = applyOps(DATASET, [patch({ tax730: true, notes: 'x' })])
    const cleared = applyOps(tagged, [patch({ tax730: false, notes: '  ' }, 2)])
    expect(cleared.expenses[0]).not.toHaveProperty('tax730')
    expect(cleared.expenses[0]).not.toHaveProperty('notes')
  })

  it('ignora le annotazioni su spese che non esistono', () => {
    const next = applyOps(DATASET, [patch({ expenseId: 'inesistente', tax730: true })])
    expect(next.expenses[0]?.tax730).toBeUndefined()
  })
})

describe('creare, correggere, eliminare', () => {
  const crea = (ts = 1): OutboxEntry => ({ kind: 'create', expense: NUOVA, entryId: `c${ts}`, ts })

  it('aggiunge una spesa nuova', () => {
    const next = applyOps(DATASET, [crea()])
    expect(next.expenses).toHaveLength(2)
    expect(next.expenses[1]?.title).toBe('Spesa Esselunga')
    expect(DATASET.expenses).toHaveLength(1)
  })

  it('non aggiunge due volte la stessa spesa', () => {
    /* Succede davvero: il commit è andato a buon fine ma Pages serve ancora il
       file vecchio, quindi la voce resta in coda e viene riapplicata. */
    const next = applyOps(applyOps(DATASET, [crea()]), [crea(2)])
    expect(next.expenses).toHaveLength(2)
  })

  it('corregge i campi di una spesa esistente', () => {
    const next = applyOps(DATASET, [
      { kind: 'update', expenseId: 'a', fields: { amount: 100, shares: { me: 50, partner: 50 } }, entryId: 'u', ts: 1 },
    ])
    expect(next.expenses[0]?.amount).toBe(100)
    expect(next.expenses[0]?.shares).toEqual({ me: 50, partner: 50 })
  })

  it('elimina una spesa', () => {
    const next = applyOps(DATASET, [{ kind: 'delete', expenseId: 'a', entryId: 'd', ts: 1 }])
    expect(next.expenses).toHaveLength(0)
  })

  it('creare e poi eliminare lascia il dataset come prima', () => {
    const next = applyOps(DATASET, [
      crea(1),
      { kind: 'delete', expenseId: 'b', entryId: 'd', ts: 2 },
    ])
    expect(next.expenses.map((e) => e.id)).toEqual(['a'])
  })

  it('dopo un\'eliminazione le operazioni successive colpiscono ancora la spesa giusta', () => {
    /* L'eliminazione sposta gli indici: se la mappa id→posizione non si rifà,
       la nota finisce sulla spesa sbagliata. */
    const due = applyOps(DATASET, [crea(1)])
    const next = applyOps(due, [
      { kind: 'delete', expenseId: 'a', entryId: 'd', ts: 2 },
      { kind: 'patch', expenseId: 'b', notes: 'sulla seconda', entryId: 'p', ts: 3 },
    ])
    expect(next.expenses).toHaveLength(1)
    expect(next.expenses[0]?.id).toBe('b')
    expect(next.expenses[0]?.notes).toBe('sulla seconda')
  })

  it('aggiunge un viaggio, una volta sola', () => {
    const viaggio = {
      kind: 'trip' as const,
      trip: { id: 'sicilia-2026', name: 'Sicilia', place: 'Palermo', year: 2026, start: '2026-09-12', end: '2026-09-20' },
      entryId: 't',
      ts: 1,
    }
    const next = applyOps(applyOps(DATASET, [viaggio]), [{ ...viaggio, entryId: 't2', ts: 2 }])
    expect(next.trips).toHaveLength(1)
  })
})

describe('coda già pubblicata', () => {
  it('riconosce quando il dato scaricato contiene già l’annotazione', () => {
    const applied = applyOps(DATASET, [patch({ tax730: true })])
    expect(isAlreadyApplied(applied, patch({ tax730: true }))).toBe(true)
    expect(isAlreadyApplied(DATASET, patch({ tax730: true }))).toBe(false)
  })

  it('riconosce una creazione già pubblicata, e un\'eliminazione già avvenuta', () => {
    const crea: OutboxEntry = { kind: 'create', expense: NUOVA, entryId: 'c', ts: 1 }
    const elimina: OutboxEntry = { kind: 'delete', expenseId: 'a', entryId: 'd', ts: 1 }
    expect(isAlreadyApplied(DATASET, crea)).toBe(false)
    expect(isAlreadyApplied(applyOps(DATASET, [crea]), crea)).toBe(true)
    expect(isAlreadyApplied(DATASET, elimina)).toBe(false)
    expect(isAlreadyApplied(applyOps(DATASET, [elimina]), elimina)).toBe(true)
  })

  it('scarta dalla coda le voci già pubblicate', () => {
    const applied = applyOps(DATASET, [patch({ tax730: true })])
    const state = { pending: [], settled: [patch({ tax730: true }), patch({ notes: 'altro' }, 2)] }
    // `now` vicino ai timestamp delle voci: nessuna è ancora scaduta per tempo
    const pruned = pruneSettled(state, applied, 1000)
    expect(pruned.settled.map((e) => e.entryId)).toEqual(['e2'])
  })

  it('dimentica le voci troppo vecchie per essere ancora in volo', () => {
    const old = patch({ notes: 'vecchia' }, 1)
    const pruned = pruneSettled({ pending: [], settled: [old] }, DATASET, 40 * 24 * 60 * 60 * 1000)
    expect(pruned.settled).toHaveLength(0)
  })
})

describe('messaggio di commit', () => {
  it('dice cosa è cambiato, al plurale giusto', () => {
    expect(describeOps([patch({ tax730: true })])).toBe('1 annotazione')
    expect(
      describeOps([
        { kind: 'create', expense: NUOVA, entryId: 'c1', ts: 1 },
        { kind: 'create', expense: { ...NUOVA, id: 'c' }, entryId: 'c2', ts: 2 },
        { kind: 'delete', expenseId: 'a', entryId: 'd', ts: 3 },
      ]),
    ).toBe('2 spese aggiunte, 1 spesa eliminata')
  })
})
