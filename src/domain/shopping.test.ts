import { describe, expect, it } from 'vitest'

import { priceBoard } from './prices'
import {
  bestKnownPrice,
  qtyLabel,
  revivedFields,
  taken,
  toBuy,
  validateShoppingItem,
} from './shopping'
import type { PriceEntry, ShoppingItem } from './types'

function item(over: Partial<ShoppingItem> = {}): ShoppingItem {
  return {
    id: 'lista-2026-09-03-a1b2c3d4',
    title: 'Latte',
    wantedAt: '2026-09-03T10:00:00.000Z',
    ...over,
  }
}

describe('la quantità come si legge', () => {
  it('i pezzi portano il segno di moltiplicazione', () => {
    expect(qtyLabel({ qty: 3, unit: 'pezzo' })).toBe('×3')
  })

  it('le misure portano l’unità', () => {
    expect(qtyLabel({ qty: 3, unit: 'kg' })).toBe('3 kg')
    expect(qtyLabel({ qty: 500, unit: 'g' })).toBe('500 g')
    expect(qtyLabel({ qty: 500, unit: 'ml' })).toBe('500 ml')
  })

  /* La virgola, non il punto: è un numero che si legge in italiano. */
  it('i decimali con la virgola', () => {
    expect(qtyLabel({ qty: 1.5, unit: 'l' })).toBe('1,5 L')
    expect(qtyLabel({ qty: 0.5, unit: 'kg' })).toBe('0,5 kg')
  })

  /*
   * `undefined` e non la stringa vuota: chi disegna deve poter non mettere
   * niente, non un elemento vuoto che si prende la sua colonna.
   */
  it('senza quantità non c’è etichetta', () => {
    expect(qtyLabel({})).toBeUndefined()
    expect(qtyLabel({ unit: 'kg' })).toBeUndefined()
  })

  it('una quantità senza unità si legge come pezzi', () => {
    expect(qtyLabel({ qty: 2 })).toBe('×2')
  })

  /* Un dato scritto a mano può portare zero o un numero negativo: si tace,
     invece di scrivere «×0» accanto a una cosa da comprare. */
  it('una quantità impossibile non si scrive', () => {
    expect(qtyLabel({ qty: 0, unit: 'kg' })).toBeUndefined()
    expect(qtyLabel({ qty: -1, unit: 'kg' })).toBeUndefined()
    expect(qtyLabel({ qty: Number.NaN, unit: 'kg' })).toBeUndefined()
  })
})

describe('la lista e lo storico', () => {
  const pane = item({ id: 'a', title: 'Pane', wantedAt: '2026-09-01T08:00:00.000Z' })
  const latte = item({ id: 'b', title: 'Latte', wantedAt: '2026-09-03T09:00:00.000Z' })
  const uova = item({
    id: 'c',
    title: 'Uova',
    wantedAt: '2026-09-02T08:00:00.000Z',
    takenAt: '2026-09-02T18:00:00.000Z',
  })
  const olio = item({
    id: 'd',
    title: 'Olio',
    wantedAt: '2026-08-20T08:00:00.000Z',
    takenAt: '2026-09-03T07:00:00.000Z',
  })
  const tutti = [pane, latte, uova, olio]

  it('la lista è solo ciò che resta da prendere, dalla più recente', () => {
    expect(toBuy(tutti).map((i) => i.id)).toEqual(['b', 'a'])
  })

  it('lo storico è ciò che è stato preso, dall’ultima', () => {
    expect(taken(tutti).map((i) => i.id)).toEqual(['d', 'c'])
  })

  /*
   * Il caso che giustifica `wantedAt` invece dell'ordine dell'elenco: riprendere
   * una cosa dallo storico non la muove di posto nell'array, quindi con l'ordine
   * di inserimento «Olio», richiesto adesso, comparirebbe in fondo — fra le cose
   * di due settimane prima. → ADR-0089
   */
  it('una cosa ripresa dallo storico torna in cima alla lista', () => {
    const ripreso = tutti.map((i) =>
      i.id === 'd' ? { ...i, wantedAt: '2026-09-03T11:00:00.000Z', takenAt: undefined } : i,
    )
    expect(toBuy(ripreso).map((i) => i.id)).toEqual(['d', 'b', 'a'])
  })

  it('non tocca l’elenco che riceve', () => {
    const copia = [...tutti]
    toBuy(tutti)
    taken(tutti)
    expect(tutti).toEqual(copia)
  })
})

describe('il prezzo che sappiamo', () => {
  const prezzo = (over: Partial<PriceEntry>): PriceEntry => ({
    id: `prezzo-${String(Math.random()).slice(2, 8)}`,
    product: 'Passata di pomodoro',
    store: 'Esselunga',
    unit: 'kg',
    price: 2.15,
    date: '2026-08-01',
    ...over,
  })

  const prezzi = [
    prezzo({ store: 'Esselunga', price: 2.15 }),
    prezzo({ store: 'Coop', price: 1.99 }),
    prezzo({ product: 'Latte', unit: 'l', price: 1.29, store: 'Coop', date: '2026-08-10' }),
  ]
  const board = priceBoard(prezzi)

  it('trova il migliore per nome, con il suo negozio e la sua unità', () => {
    expect(bestKnownPrice(board, 'Passata di pomodoro')).toEqual({
      store: 'Coop',
      price: 1.99,
      unit: 'kg',
    })
  })

  /* Il collegamento è il nome **normalizzato**, la stessa chiave dei prezzi. */
  it('non si fa fermare da maiuscole e spazi', () => {
    expect(bestKnownPrice(board, '  passata  di pomodoro ')?.price).toBe(1.99)
  })

  it('di una cosa che non abbiamo mai rilevato non dice niente', () => {
    expect(bestKnownPrice(board, 'Lievito')).toBeUndefined()
    expect(bestKnownPrice(board, '   ')).toBeUndefined()
  })

  /*
   * Lo stesso prodotto rilevato con due unità fa due gruppi (→ ADR-0041): vince
   * quello **aggiornato più di recente**, che è il prezzo che ci si aspetta di
   * ritrovare a scaffale, e non il più basso — che confronterebbe grandezze
   * diverse.
   */
  it('fra due unità vince la rilevazione più recente', () => {
    const doppio = priceBoard([
      prezzo({ product: 'Uova', unit: 'pezzo', price: 0.4, date: '2026-08-01', store: 'Coop' }),
      prezzo({ product: 'Uova', unit: 'kg', price: 6.5, date: '2026-08-20', store: 'Esselunga' }),
    ])
    expect(bestKnownPrice(doppio, 'Uova')).toEqual({
      store: 'Esselunga',
      price: 6.5,
      unit: 'kg',
    })
  })
})

describe('cosa si può salvare', () => {
  const nessuno = new Set<string>()

  it('il titolo è l’unico campo obbligatorio', () => {
    expect(validateShoppingItem(item(), nessuno)).toEqual([])
    expect(validateShoppingItem(item({ title: '   ' }), nessuno)).toHaveLength(1)
  })

  it('con tutto compilato', () => {
    const pieno = item({ qty: 1.5, unit: 'kg', store: 'Coop', note: 'quelle rosse' })
    expect(validateShoppingItem(pieno, nessuno)).toEqual([])
  })

  it('un id doppio si rifiuta', () => {
    expect(validateShoppingItem(item(), new Set(['lista-2026-09-03-a1b2c3d4']))).toHaveLength(1)
  })

  it('la quantità deve essere un numero possibile', () => {
    expect(validateShoppingItem(item({ qty: 0, unit: 'kg' }), nessuno)).toHaveLength(1)
    expect(validateShoppingItem(item({ qty: -2, unit: 'kg' }), nessuno)).toHaveLength(1)
    expect(validateShoppingItem(item({ qty: 10_000, unit: 'g' }), nessuno)).toHaveLength(1)
    expect(validateShoppingItem(item({ qty: 1.2345, unit: 'kg' }), nessuno)).toHaveLength(1)
  })

  /*
   * Le due asimmetrie volute: la quantità senza unità si sa leggere (sono
   * pezzi), l'unità senza quantità no — «kg di mele» non vuol dire niente.
   */
  it('la quantità senza unità va bene, l’unità senza quantità no', () => {
    expect(validateShoppingItem(item({ qty: 3 }), nessuno)).toEqual([])
    expect(validateShoppingItem(item({ unit: 'kg' }), nessuno)).toHaveLength(1)
  })

  it('un’unità che non esiste si rifiuta', () => {
    const strana = item({ qty: 1, unit: 'litri' as never })
    expect(validateShoppingItem(strana, nessuno)).toHaveLength(1)
  })

  /* Come per le carte: una data che l'app accetta e la pubblicazione rifiuta
     bloccherebbe `npm run encrypt` per **tutti** i file. */
  it('le due date devono essere istanti veri', () => {
    expect(validateShoppingItem(item({ wantedAt: '2026-09-03' }), nessuno)).toHaveLength(1)
    expect(validateShoppingItem(item({ wantedAt: '2026-02-30T10:00:00.000Z' }), nessuno)).toHaveLength(1)
    expect(validateShoppingItem(item({ takenAt: 'ieri' }), nessuno)).toHaveLength(1)
    expect(validateShoppingItem(item({ takenAt: '2026-09-03T18:30:00.000Z' }), nessuno)).toEqual([])
  })

  it('il titolo e la nota hanno un tetto', () => {
    expect(validateShoppingItem(item({ title: 'a'.repeat(101) }), nessuno)).toHaveLength(1)
    expect(validateShoppingItem(item({ note: 'a'.repeat(301) }), nessuno)).toHaveLength(1)
    expect(validateShoppingItem(item({ store: 'a'.repeat(61) }), nessuno)).toHaveLength(1)
  })
})

/*
 * La regola che il banco ha insegnato: lo storico è la memoria, quindi un campo
 * vuoto nel modulo vuol dire «tieni quello di prima». → ADR-0089
 */
describe('una cosa che rientra dallo storico', () => {
  const nel = item({
    title: 'Caffè',
    qty: 2,
    unit: 'pezzo',
    store: 'Supermercato A',
    note: 'macinato',
    takenAt: '2026-09-02T19:00:00.000Z',
  })

  it('non si fa rinominare dalla grafia appena scritta', () => {
    const scritto = item({ title: 'caffè' })
    expect(revivedFields(nel, scritto)).not.toHaveProperty('title')
  })

  /* Il difetto vero: senza questa regola il negozio e la nota sparivano perché
     nel modulo erano vuoti — cioè la memoria si cancellava da sé. */
  it('non perde negozio e nota lasciati vuoti', () => {
    const scritto = item({ title: 'caffè' })
    expect(revivedFields(nel, scritto)).toEqual({})
  })

  it('ma quello che scrivi vince', () => {
    const scritto = item({ title: 'caffè', qty: 1, unit: 'kg', store: 'Coop', note: 'in grani' })
    expect(revivedFields(nel, scritto)).toEqual({
      qty: 1,
      unit: 'kg',
      store: 'Coop',
      note: 'in grani',
    })
  })

  it('l’unità viaggia con la quantità, anche se cambia solo lei', () => {
    const scritto = item({ title: 'caffè', qty: 2, unit: 'kg' })
    expect(revivedFields(nel, scritto)).toEqual({ qty: 2, unit: 'kg' })
  })

  it('e una quantità identica non scrive niente', () => {
    const scritto = item({ title: 'caffè', qty: 2, unit: 'pezzo' })
    expect(revivedFields(nel, scritto)).toEqual({})
  })
})
