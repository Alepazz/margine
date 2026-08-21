import { describe, expect, it } from 'vitest'

import { filterBoard, priceBoard, suggest, unitOf } from './prices'
import { nameKey } from './text'
import type { PriceEntry } from './types'

/** Una rilevazione, con i campi che al test non servono già riempiti. */
const p = (
  product: string,
  store: string,
  price: number,
  date: string,
  unit: PriceEntry['unit'] = 'kg',
): PriceEntry => ({ id: `${product}-${store}-${date}-${price}`, product, store, unit, price, date })

describe('nameKey', () => {
  it('rende lo stesso nome le grafie che differiscono per spazi e maiuscole', () => {
    expect(nameKey('  Passata   di POMODORO ')).toBe('passata di pomodoro')
  })

  it('tiene gli accenti, che in italiano distinguono le parole', () => {
    expect(nameKey('Però')).not.toBe(nameKey('Pero'))
  })
})

describe('priceBoard', () => {
  it('raggruppa per nome normalizzato e mette il più conveniente per primo', () => {
    const board = priceBoard([
      p('Passata di pomodoro', 'Esselunga', 2.15, '2026-08-10'),
      p('passata  di pomodoro', 'Lidl', 1.79, '2026-08-12'),
    ])

    expect(board).toHaveLength(1)
    expect(board[0]?.rows.map((row) => row.store)).toEqual(['Lidl', 'Esselunga'])
    expect(board[0]?.rows[0]?.latest.price).toBe(1.79)
  })

  it('mostra la grafia della rilevazione più recente', () => {
    const board = priceBoard([
      p('passata di pomodoro', 'Lidl', 1.79, '2026-08-10'),
      p('Passata di pomodoro', 'Esselunga', 2.15, '2026-08-12'),
    ])
    expect(board[0]?.product).toBe('Passata di pomodoro')
    expect(board[0]?.updated).toBe('2026-08-12')
  })

  it('tiene separati due gruppi quando l’unità è diversa, perché non si confrontano', () => {
    const board = priceBoard([
      p('Latte', 'Lidl', 1.29, '2026-08-10', 'l'),
      p('Latte', 'Esselunga', 0.99, '2026-08-11', 'pezzo'),
    ])
    expect(board).toHaveLength(2)
    expect(board.map((group) => group.unit).sort()).toEqual(['l', 'pezzo'])
  })

  it('per lo stesso supermercato tiene l’ultimo prezzo e conserva lo storico', () => {
    const board = priceBoard([
      p('Caffè', 'Esselunga', 12.9, '2026-06-01'),
      p('Caffè', 'Esselunga', 14.5, '2026-08-01'),
      p('Caffè', 'Esselunga', 13.8, '2026-07-01'),
    ])

    const row = board[0]?.rows[0]
    expect(row?.latest.price).toBe(14.5)
    expect(row?.history.map((entry) => entry.price)).toEqual([14.5, 13.8, 12.9])
  })

  it('a pari data vince l’ultima inserita: è la correzione, non l’originale', () => {
    const board = priceBoard([
      p('Caffè', 'Esselunga', 14.5, '2026-08-01'),
      p('Caffè', 'Esselunga', 13.9, '2026-08-01'),
    ])
    expect(board[0]?.rows[0]?.latest.price).toBe(13.9)
    expect(board[0]?.rows[0]?.history.map((entry) => entry.price)).toEqual([13.9, 14.5])
  })

  /*
   * Il test che giustifica i centesimi: in virgola mobile (2,15 − 2) / 2 vale
   * 0,0749999… e arrotonda a 7%, che è il numero sbagliato. → ADR-0008
   */
  it('calcola lo scarto in centesimi, non in virgola mobile', () => {
    const board = priceBoard([
      p('Olio', 'Lidl', 2, '2026-08-10', 'l'),
      p('Olio', 'Esselunga', 2.15, '2026-08-10', 'l'),
    ])

    const [best, other] = board[0]?.rows ?? []
    expect(best?.overBest).toBe(0)
    expect(other?.overBest).toBe(0.075)
    expect(Math.round((other?.overBest ?? 0) * 100)).toBe(8)
  })

  it('ordina i gruppi per nome del prodotto', () => {
    const board = priceBoard([
      p('Zucchero', 'Lidl', 1.1, '2026-08-10'),
      p('Aceto', 'Lidl', 2.2, '2026-08-10'),
    ])
    expect(board.map((group) => group.product)).toEqual(['Aceto', 'Zucchero'])
  })

  it('senza rilevazioni non inventa gruppi', () => {
    expect(priceBoard([])).toEqual([])
  })
})

describe('filterBoard', () => {
  const board = priceBoard([
    p('Passata di pomodoro', 'Esselunga', 2.15, '2026-08-10'),
    p('Caffè', 'Lidl', 12.9, '2026-08-10'),
  ])

  it('trova per nome del prodotto, ignorando le maiuscole', () => {
    expect(filterBoard(board, 'PASSATA').map((group) => group.product)).toEqual([
      'Passata di pomodoro',
    ])
  })

  it('trova anche per supermercato', () => {
    expect(filterBoard(board, 'lidl').map((group) => group.product)).toEqual(['Caffè'])
  })

  it('senza ricerca restituisce tutto', () => {
    expect(filterBoard(board, '  ')).toHaveLength(2)
  })
})

describe('suggest', () => {
  it('propone dalla più recente, senza doppioni', () => {
    expect(suggest(['Lidl', 'Esselunga', 'Lidl'], '')).toEqual(['Lidl', 'Esselunga'])
  })

  it('la grafia più recente vince su quella vecchia', () => {
    expect(suggest(['esselunga', 'Esselunga'], '')).toEqual(['Esselunga'])
  })

  it('filtra per sottostringa', () => {
    expect(suggest(['Lidl', 'Esselunga', 'Coop'], 'lun')).toEqual(['Esselunga'])
  })

  it('non ne propone più di sei', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    expect(suggest(many, '')).toHaveLength(6)
  })

  it('salta i valori vuoti', () => {
    expect(suggest(['   ', 'Coop'], '')).toEqual(['Coop'])
  })
})

describe('unitOf', () => {
  const prices = [
    p('Latte', 'Lidl', 1.29, '2026-08-01', 'l'),
    p('Caffè', 'Lidl', 12.9, '2026-08-02'),
  ]

  it('ritrova l’unità già usata per quel prodotto', () => {
    expect(unitOf(prices, ' latte ')).toBe('l')
  })

  it('non indovina per un prodotto nuovo', () => {
    expect(unitOf(prices, 'Zucchero')).toBeUndefined()
    expect(unitOf(prices, '')).toBeUndefined()
  })

  it('a nome ripetuto vale l’ultima scelta', () => {
    expect(unitOf([...prices, p('Latte', 'Coop', 0.99, '2026-08-03', 'pezzo')], 'Latte')).toBe('pezzo')
  })
})
