/**
 * Le regole nel browser e quelle dell'import devono concordare.
 *
 * Sono due implementazioni della stessa cosa — `src/domain/expense-rules.ts` per
 * il modulo di inserimento, `validate-core.mjs` per la sessione mensile — come
 * accade per la cifratura, che ha lo stesso tipo di test.
 *
 * La garanzia è **in una direzione sola**, ed è quella che conta: se l'app
 * accetta una spesa, `npm run validate` non deve trovarci errori. Il contrario
 * non vale di proposito: l'import tollera con un avviso un importo a zero o una
 * sottocategoria fuori tassonomia, mentre un modulo di inserimento non deve
 * permetterli affatto.
 *
 * Il test vive qui, fra gli script, e non fra i test del dominio: così a
 * raggiungere il mondo non tipizzato è il file non tipizzato, e `tsc` non deve
 * sapere niente di un `.mjs` senza dichiarazioni.
 */

import { describe, expect, it } from 'vitest'

import { validateExpense } from '../../src/domain/expense-rules.ts'
import { CATEGORIES } from './taxonomy.mjs'
import { validateDataset } from './validate-core.mjs'

const CONFIG = { categories: CATEGORIES }

const TRIPS = [
  {
    id: 'sicilia-2026',
    name: 'Sicilia',
    place: 'Palermo',
    year: 2026,
    start: '2026-09-12',
    end: '2026-09-20',
  },
]

const CTX = { categories: CATEGORIES, tripIds: TRIPS.map((t) => t.id), takenIds: new Set() }

function base(overrides = {}) {
  return {
    id: '2026-08-20-abcd1234',
    date: '2026-08-20',
    title: 'Spesa Esselunga',
    amount: 47.3,
    shares: { me: 23.65, partner: 23.65 },
    paidBy: 'me',
    source: 'condivise',
    category: 'spesa',
    recurring: false,
    ...overrides,
  }
}

/** I casi che il modulo deve poter salvare: nessuno può far arrabbiare l'import. */
const ACCETTABILI = [
  ['divisa a metà', base()],
  ['tutta mia', base({ shares: { me: 47.3, partner: 0 } })],
  ['tutta sua', base({ shares: { me: 0, partner: 47.3 }, paidBy: 'partner' })],
  ['importo dispari, metà arrotondata', base({ amount: 5.05, shares: { me: 2.53, partner: 2.52 } })],
  ['personale', base({ source: 'personali', shares: { me: 47.3, partner: 0 } })],
  ['fissa ricorrente', base({ source: 'fisse', recurring: true, category: 'casa', subcategory: 'affitto' })],
  [
    'di vacanza, con quota di terzi',
    base({
      source: 'vacanze',
      trip: 'sicilia-2026',
      category: 'viaggi',
      subcategory: 'cibo',
      amount: 90,
      shares: { me: 30, partner: 30, others: 30 },
    }),
  ],
  [
    'anticipata da un terzo in vacanza',
    base({
      source: 'vacanze',
      trip: 'sicilia-2026',
      category: 'viaggi',
      paidBy: 'others',
      amount: 60,
      shares: { me: 20, partner: 20, others: 20 },
    }),
  ],
  ['col welfare', base({ welfare: true })],
  ['con nota e scontrino', base({ notes: 'fattura chiesta', receiptLinks: ['https://drive.google.com/x'] })],
]

/** I casi che il modulo deve rifiutare. */
const RIFIUTABILI = [
  ['quote che non sommano', base({ shares: { me: 20, partner: 20 } })],
  ['quota negativa', base({ shares: { me: -1, partner: 48.3 } })],
  ['importo a zero', base({ amount: 0, shares: { me: 0, partner: 0 } })],
  ['data inventata', base({ date: '2026-02-31' })],
  ['data malformata', base({ date: '20/08/2026' })],
  ['senza descrizione', base({ title: '   ' })],
  ['categoria inesistente', base({ category: 'nuvole' })],
  ['sottocategoria di un\'altra categoria', base({ category: 'casa', subcategory: 'psicologo' })],
  ['vacanza senza viaggio', base({ source: 'vacanze', category: 'viaggi' })],
  ['vacanza con viaggio inesistente', base({ source: 'vacanze', category: 'viaggi', trip: 'marte-2030' })],
  ['viaggio fuori dalle vacanze', base({ trip: 'sicilia-2026' })],
  ['quota di terzi fuori dalle vacanze', base({ amount: 90, shares: { me: 30, partner: 30, others: 30 } })],
  ['welfare su un conto anticipato da altri', base({ paidBy: 'others', welfare: true })],
  ['registro inventato', base({ source: 'regali' })],
  ['link allo scontrino non valido', base({ receiptLinks: ['drive.google.com/x'] })],
  ['tre decimali', base({ amount: 47.333, shares: { me: 23.665, partner: 23.668 } })],
]

describe('regole di una spesa: il browser e l’import concordano', () => {
  for (const [nome, expense] of ACCETTABILI) {
    it(`accetta: ${nome}`, () => {
      expect(validateExpense(expense, CTX)).toEqual([])
      // e l'import non ci trova errori: è la direzione che conta
      const { errors } = validateDataset({ expenses: [expense], trips: TRIPS }, CONFIG)
      expect(errors).toEqual([])
    })
  }

  for (const [nome, expense] of RIFIUTABILI) {
    it(`rifiuta: ${nome}`, () => {
      expect(validateExpense(expense, CTX).length).toBeGreaterThan(0)
    })
  }

  it('rifiuta un id già preso', () => {
    const taken = { ...CTX, takenIds: new Set(['2026-08-20-abcd1234']) }
    expect(validateExpense(base(), taken).length).toBeGreaterThan(0)
  })
})
