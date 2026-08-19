import { describe, expect, it } from 'vitest'

import { applyAnnotations, isAlreadyApplied, pruneSettled, type OutboxEntry } from './outbox'
import type { Dataset } from '../domain/types'

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
}

const entry = (patch: Partial<OutboxEntry>, ts = 1): OutboxEntry => ({
  entryId: `e${ts}`,
  expenseId: 'a',
  ts,
  ...patch,
})

describe('applicazione delle annotazioni', () => {
  it('applica tag, nota e scontrini', () => {
    const next = applyAnnotations(DATASET, [
      entry({ tax730: true, notes: 'Ricevuta chiesta', receiptLinks: ['https://drive.google.com/x'] }),
    ])
    expect(next.expenses[0]?.tax730).toBe(true)
    expect(next.expenses[0]?.notes).toBe('Ricevuta chiesta')
    expect(next.expenses[0]?.receiptLinks).toEqual(['https://drive.google.com/x'])
  })

  it('non modifica il dataset originale', () => {
    applyAnnotations(DATASET, [entry({ tax730: true })])
    expect(DATASET.expenses[0]?.tax730).toBeUndefined()
  })

  it('applica le patch in ordine cronologico, non di inserimento', () => {
    const next = applyAnnotations(DATASET, [
      entry({ notes: 'seconda' }, 20),
      entry({ notes: 'prima' }, 10),
    ])
    expect(next.expenses[0]?.notes).toBe('seconda')
  })

  it('toglie i campi svuotati invece di lasciarli vuoti nel file', () => {
    const tagged = applyAnnotations(DATASET, [entry({ tax730: true, notes: 'x' })])
    const cleared = applyAnnotations(tagged, [entry({ tax730: false, notes: '  ' }, 2)])
    expect(cleared.expenses[0]).not.toHaveProperty('tax730')
    expect(cleared.expenses[0]).not.toHaveProperty('notes')
  })

  it('ignora le annotazioni su spese che non esistono', () => {
    const next = applyAnnotations(DATASET, [entry({ expenseId: 'inesistente', tax730: true })])
    expect(next.expenses[0]?.tax730).toBeUndefined()
  })
})

describe('coda già pubblicata', () => {
  it('riconosce quando il dato scaricato contiene già l’annotazione', () => {
    const applied = applyAnnotations(DATASET, [entry({ tax730: true })])
    expect(isAlreadyApplied(applied, entry({ tax730: true }))).toBe(true)
    expect(isAlreadyApplied(DATASET, entry({ tax730: true }))).toBe(false)
  })

  it('scarta dalla coda le voci già pubblicate', () => {
    const applied = applyAnnotations(DATASET, [entry({ tax730: true })])
    const state = { pending: [], settled: [entry({ tax730: true }), entry({ notes: 'altro' }, 2)] }
    // `now` vicino ai timestamp delle voci: nessuna è ancora scaduta per tempo
    const pruned = pruneSettled(state, applied, 1000)
    expect(pruned.settled.map((e) => e.entryId)).toEqual(['e2'])
  })

  it('dimentica le voci troppo vecchie per essere ancora in volo', () => {
    const old = entry({ notes: 'vecchia' }, 1)
    const pruned = pruneSettled({ pending: [], settled: [old] }, DATASET, 40 * 24 * 60 * 60 * 1000)
    expect(pruned.settled).toHaveLength(0)
  })
})
