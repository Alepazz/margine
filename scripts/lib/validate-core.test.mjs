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
  id: 'vacanza',
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
            tricount: 'vacanza',
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
            tricount: 'vacanza',
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
            tricount: 'vacanza',
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

// ─────────────────────── rilevazioni di prezzo (ADR-0041) ───────────────────────

function price(partial) {
  return {
    id: 'prezzo-2026-08-21-aaa',
    product: 'Passata di pomodoro',
    store: 'Esselunga',
    unit: 'kg',
    price: 2.15,
    date: '2026-08-21',
    ...partial,
  }
}

/** Un dataset con delle rilevazioni e nessuna spesa: sono liste indipendenti. */
function withPrices(prices) {
  return { ...dataset([]), prices }
}

describe('decimali di una spesa', () => {
  /* Il controllo era `X !== X`: sempre falso, quindi muto da sempre. Questi due
     test esistono perché la versione ingenua che verrebbe in mente per
     ripararlo (`Math.round(x*100) !== x*100`) sarebbe un falso positivo. */
  it('avvisa su tre decimali', () => {
    const { warnings } = validateDataset(
      dataset([expense({ amount: 100.005, shares: { me: 50, partner: 50.005 } })]),
      CONFIG,
    )
    expect(warnings.some((w) => w.includes('più di due decimali'))).toBe(true)
  })

  it('e tace su un importo che in virgola mobile sembrerebbe sbagliato', () => {
    /* 2.15 * 100 = 214.99999999999997 */
    const { warnings, errors } = validateDataset(
      dataset([expense({ amount: 2.15, shares: { me: 1.08, partner: 1.07 } })]),
      CONFIG,
    )
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
  })
})

describe('prezzi', () => {
  it('accetta una rilevazione completa', () => {
    const { errors, warnings } = validateDataset(withPrices([price({})]), CONFIG)
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
  })

  it('regge un dataset senza il campo, come quelli scritti prima', () => {
    const { errors } = validateDataset(dataset([]), CONFIG)
    expect(errors).toEqual([])
  })

  it('rifiuta due rilevazioni con lo stesso id', () => {
    const { errors } = validateDataset(withPrices([price({}), price({})]), CONFIG)
    expect(errors.some((e) => e.includes('id di rilevazione duplicato'))).toBe(true)
  })

  it('rifiuta un’unità che non esiste', () => {
    const { errors } = validateDataset(withPrices([price({ unit: 'etto' })]), CONFIG)
    expect(errors.some((e) => e.includes('unità sconosciuta'))).toBe(true)
  })

  it('rifiuta un prezzo a tre decimali, e accetta quello a due', () => {
    const tre = validateDataset(withPrices([price({ price: 2.155 })]), CONFIG)
    expect(tre.errors.some((e) => e.includes('più di due decimali'))).toBe(true)
    /* 2.15 * 100 in virgola mobile fa 214.99999999999997: il controllo
       aritmetico lo segnalerebbe, quello sulla rappresentazione no. */
    const due = validateDataset(withPrices([price({ price: 2.15 })]), CONFIG)
    expect(due.errors).toEqual([])
  })

  it('rifiuta prezzo non positivo, prodotto vuoto, supermercato vuoto e data finta', () => {
    const { errors } = validateDataset(
      withPrices([
        price({ id: 'p1', price: 0 }),
        price({ id: 'p2', product: '   ' }),
        price({ id: 'p3', store: '' }),
        price({ id: 'p4', date: '2026-02-31' }),
      ]),
      CONFIG,
    )
    expect(errors.some((e) => e.includes('prezzo non positivo'))).toBe(true)
    expect(errors.some((e) => e.includes('manca il prodotto'))).toBe(true)
    expect(errors.some((e) => e.includes('manca il supermercato'))).toBe(true)
    expect(errors.some((e) => e.includes('data non valida'))).toBe(true)
  })

  it('avvisa — senza rifiutare — lo stesso prodotto rilevato in due unità', () => {
    const { errors, warnings } = validateDataset(
      withPrices([
        price({ id: 'p1', product: 'Latte', unit: 'l' }),
        price({ id: 'p2', product: ' latte ', unit: 'pezzo' }),
      ]),
      CONFIG,
    )
    expect(errors).toEqual([])
    expect(warnings.some((w) => w.includes('due gruppi che non si confrontano'))).toBe(true)
  })

  it('non avvisa quando lo stesso prodotto sta sempre nella stessa unità', () => {
    const { warnings } = validateDataset(
      withPrices([
        price({ id: 'p1', store: 'Esselunga' }),
        price({ id: 'p2', store: 'Lidl', price: 1.79 }),
      ]),
      CONFIG,
    )
    expect(warnings).toEqual([])
  })

  it('le conta nel riepilogo, senza mescolarle ai totali delle spese', () => {
    const { report } = validateDataset(
      withPrices([price({ id: 'p1' }), price({ id: 'p2', store: 'Lidl', price: 1.79 })]),
      CONFIG,
    )
    expect(report.prices).toBe(2)
    /* Nessuna spesa: le rilevazioni non entrano in nessun totale. */
    expect(report.total).toBe(0)
    expect(report.expenses).toBe(0)
  })
})

/*
 * I progetti. Le stesse tre regole di `validateTricount` nell'app, più il
 * riferimento alla categoria — che l'app non può sbagliare perché il menù offre
 * solo categorie esistenti, e qui invece si guarda il dato. → ADR-0074, ADR-0075
 */
describe('progetti', () => {
  const PROGETTO = { id: 'casa-nuova', name: 'Casa nuova', members: ['me', 'partner'], offBudget: true }

  it('un progetto è un tricount valido', () => {
    const { errors } = validateDataset(dataset([], [CONDIVISE, PROGETTO]), CONFIG)
    expect(errors).toEqual([])
  })

  it('una vacanza non può essere anche un progetto', () => {
    const { errors } = validateDataset(
      dataset([], [CONDIVISE, { ...TRIP, offBudget: true }]),
      CONFIG,
    )
    expect(errors.join(' ')).toContain('progetto')
  })

  it('la categoria ricorrente vuole un progetto e una categoria che esiste', () => {
    const suQualunque = validateDataset(
      dataset([], [{ ...CONDIVISE, recurringCategory: 'spesa' }]),
      CONFIG,
    )
    expect(suQualunque.errors.join(' ')).toContain('recurringCategory')

    const inesistente = validateDataset(
      dataset([], [CONDIVISE, { ...PROGETTO, recurringCategory: 'mutuo' }]),
      CONFIG,
    )
    expect(inesistente.errors.join(' ')).toContain('mutuo')

    const buona = validateDataset(
      dataset([], [CONDIVISE, { ...PROGETTO, recurringCategory: 'spesa' }]),
      CONFIG,
    )
    expect(buona.errors).toEqual([])
  })

  it('un rimborso può appartenere a un progetto, e solo a un progetto', () => {
    const rimborso = (tricount) => ({
      id: 's1',
      date: '2026-08-20',
      from: 'partner',
      to: 'me',
      amount: 5000,
      ...(tricount === undefined ? {} : { tricount }),
    })
    const base = dataset([], [CONDIVISE, PROGETTO])

    expect(validateDataset({ ...base, settlements: [rimborso()] }, CONFIG).errors).toEqual([])
    expect(
      validateDataset({ ...base, settlements: [rimborso('casa-nuova')] }, CONFIG).errors,
    ).toEqual([])
    expect(
      validateDataset({ ...base, settlements: [rimborso('condivise')] }, CONFIG).errors.join(' '),
    ).toContain('non è un progetto')
    expect(
      validateDataset({ ...base, settlements: [rimborso('fantasma')] }, CONFIG).errors.join(' '),
    ).toContain('inesistente')
  })
})
