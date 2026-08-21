import { describe, expect, it } from 'vitest'

import { validateDataset } from './validate-core.mjs'

const CONFIG = {
  categories: [
    { id: 'spesa', label: 'Spesa' },
    { id: 'viaggi', label: 'Viaggi', subcategories: [{ id: 'cibo', label: 'Cibo' }] },
  ],
}

const CONDIVISE = { id: 'condivise', name: 'Condivise', members: ['me', 'partner'] }
const TRIP = {
  id: 'creta',
  name: 'Creta',
  members: ['me', 'partner'],
  trip: { place: 'Creta', year: 2025, start: '2025-08-17', end: '2025-08-25' },
}

function dataset(expenses, tricounts = [CONDIVISE]) {
  return { version: 1, updatedAt: '2026-08-19T00:00:00.000Z', expenses, tricounts }
}

function expense(partial) {
  return {
    id: 'x',
    date: '2026-08-10',
    title: 'Voce',
    amount: 100,
    shares: { me: 50, partner: 50 },
    paidBy: 'me',
    tricount: 'condivise',
    category: 'spesa',
    recurring: false,
    ...partial,
  }
}

describe('quote', () => {
  it('accetta una spesa di gruppo se me + partner + others fa l’importo', () => {
    const { errors } = validateDataset(
      dataset(
        [
          expense({
            amount: 180,
            shares: { me: 30, partner: 30, others: 120 },
            paidBy: 'others',
            tricount: 'creta',
            category: 'viaggi',
            subcategory: 'cibo',
          }),
        ],
        [CONDIVISE, TRIP],
      ),
      CONFIG,
    )
    expect(errors).toEqual([])
  })

  it('rifiuta la spesa di gruppo in cui la quota dei terzi non è contata', () => {
    const { errors } = validateDataset(
      dataset(
        [
          expense({
            amount: 180,
            shares: { me: 30, partner: 30 },
            tricount: 'creta',
            category: 'viaggi',
          }),
        ],
        [CONDIVISE, TRIP],
      ),
      CONFIG,
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('le quote sommano 60.00')
  })

  it('rifiuta una quota di terzi negativa', () => {
    const { errors } = validateDataset(
      dataset([expense({ shares: { me: 60, partner: 50, others: -10 } })]),
      CONFIG,
    )
    expect(errors.some((e) => e.includes('quota «others» non valida'))).toBe(true)
  })

  it('avvisa se una quota di terzi compare fuori da una vacanza', () => {
    const { errors, warnings } = validateDataset(
      dataset([expense({ shares: { me: 40, partner: 40, others: 20 } })]),
      CONFIG,
    )
    expect(errors).toEqual([])
    expect(warnings.some((w) => w.includes('quota di terzi'))).toBe(true)
  })

  it('accetta «others» come chi ha anticipato il conto', () => {
    const { errors } = validateDataset(
      dataset([expense({ paidBy: 'others' })]),
      CONFIG,
    )
    expect(errors).toEqual([])
  })

  it('riporta la quota dei terzi nel riepilogo mensile', () => {
    const { report } = validateDataset(
      dataset(
        [
          expense({
            amount: 180,
            shares: { me: 30, partner: 30, others: 120 },
            tricount: 'creta',
            category: 'viaggi',
          }),
        ],
        [CONDIVISE, TRIP],
      ),
      CONFIG,
    )
    expect(report.months[0].others).toBe(120)
    expect(report.months[0].total).toBe(180)
  })
})
