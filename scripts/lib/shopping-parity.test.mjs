/**
 * Le regole di una voce della lista nel browser e quelle della sessione al Mac.
 *
 * Sono due implementazioni della stessa cosa — `src/domain/shopping.ts` per il
 * modulo, `validate-core.mjs` per `npm run encrypt` — come per le spese, le
 * carte e la cifratura, che hanno lo stesso tipo di test.
 *
 * La garanzia è **in una direzione sola**, ed è quella che conta: se l'app
 * accetta una voce, la pubblicazione non deve rifiutarla e lasciare i dati non
 * pubblicati. E il costo di un disaccordo è alto come per le carte, perché
 * `npm run encrypt` si ferma **senza scrivere nessuno dei quattro file**: si
 * fermerebbero anche spese e configurazione, e dal telefono nessun modo di
 * capirlo. Il contrario non vale di proposito — la validazione dei file tollera
 * con un avviso due voci con lo stesso nome, mentre nel modulo non si possono
 * produrre.
 *
 * Vive qui, fra gli script, per la stessa ragione degli altri test di parità: a
 * raggiungere il mondo non tipizzato è il file non tipizzato.
 */

import { describe, expect, it } from 'vitest'

import { validateShoppingItem } from '../../src/domain/shopping.ts'
import { validateShopping } from './validate-core.mjs'

function base(overrides = {}) {
  return {
    id: 'lista-2026-09-03-a1b2c3d4',
    title: 'Latte',
    wantedAt: '2026-09-03T10:00:00.000Z',
    ...overrides,
  }
}

/** Il file come lo scrive l'app, con una voce dentro. */
function file(item) {
  return { version: 1, updatedAt: '2026-09-03T09:00:00.000Z', items: [item] }
}

/** Le voci che il modulo deve poter salvare: nessuna può bloccare la pubblicazione. */
const ACCETTABILI = [
  ['il solo titolo, che è l’unico campo obbligatorio', base()],
  ['con la quantità a pezzi', base({ qty: 3, unit: 'pezzo' })],
  ['con la quantità a peso', base({ qty: 0.5, unit: 'kg' })],
  ['con i grammi', base({ qty: 500, unit: 'g' })],
  ['con i millilitri', base({ qty: 500, unit: 'ml' })],
  ['con la quantità e senza unità, che si legge come pezzi', base({ qty: 2 })],
  ['con il negozio', base({ store: 'Coop' })],
  ['con la nota', base({ note: 'quello senza lattosio' })],
  ['già presa, cioè nello storico', base({ takenAt: '2026-09-03T18:30:00.000Z' })],
  ['con tutto compilato', base({ qty: 1.5, unit: 'l', store: 'Esselunga', note: 'intero' })],
  ['con tre decimali di quantità, che è il limite', base({ qty: 1.125, unit: 'kg' })],
]

/** Quelle che il modulo rifiuta, e che la pubblicazione non deve accettare. */
const RIFIUTABILI = [
  ['senza titolo', base({ title: '   ' })],
  ['senza id', base({ id: '' })],
  ['con una quantità a zero', base({ qty: 0, unit: 'kg' })],
  ['con una quantità negativa', base({ qty: -3, unit: 'kg' })],
  ['con una quantità sopra il tetto', base({ qty: 10_000, unit: 'g' })],
  ['con troppi decimali', base({ qty: 1.2345, unit: 'kg' })],
  /* L'asimmetria voluta: la quantità senza unità si sa leggere, l'unità senza
     quantità no — «kg di mele» non vuol dire niente. */
  ['con l’unità e senza quantità', base({ unit: 'kg' })],
  ['con un’unità che non esiste', base({ qty: 1, unit: 'litri' })],
  ['con un titolo troppo lungo', base({ title: 'a'.repeat(101) })],
  ['con una nota troppo lunga', base({ note: 'a'.repeat(301) })],
  ['con un negozio troppo lungo', base({ store: 'a'.repeat(61) })],
  /* La data è un **istante**, non un giorno: senza l'ora lo storico non si può
     ordinare. */
  ['con un giorno al posto di un istante', base({ wantedAt: '2026-09-03' })],
  ['con un istante che non esiste', base({ wantedAt: '2026-02-30T10:00:00.000Z' })],
  ['con una data di quando è stata presa non valida', base({ takenAt: 'ieri' })],
]

describe('le regole di una voce della lista: due implementazioni, un verdetto', () => {
  it.each(ACCETTABILI)('l’app accetta %s, e la pubblicazione non la rifiuta', (_nome, item) => {
    expect(validateShoppingItem(item, new Set())).toEqual([])
    expect(validateShopping(file(item)).errors).toEqual([])
  })

  it.each(RIFIUTABILI)('l’app rifiuta %s, e anche la pubblicazione', (_nome, item) => {
    expect(validateShoppingItem(item, new Set()).length).toBeGreaterThan(0)
    expect(validateShopping(file(item)).errors.length).toBeGreaterThan(0)
  })

  it('un id doppio lo vedono entrambe', () => {
    const item = base()
    expect(validateShoppingItem(item, new Set([item.id])).length).toBeGreaterThan(0)
    expect(validateShopping({ ...file(item), items: [item, item] }).errors.length).toBeGreaterThan(0)
  })

  /* Il contrario non vale, e va scritto: la pubblicazione tollera con un avviso
     due voci con lo stesso nome, che dall'app non si possono produrre. */
  it('due nomi uguali sono un avviso, non un errore', () => {
    const doppio = {
      version: 1,
      updatedAt: '2026-09-03T09:00:00.000Z',
      items: [base(), base({ id: 'lista-2026-09-03-b2c3d4e5', title: '  latte ' })],
    }
    const verdetto = validateShopping(doppio)
    expect(verdetto.errors).toEqual([])
    expect(verdetto.warnings.length).toBe(1)
  })

  it('un file senza elenco è un errore, non una lista vuota', () => {
    expect(validateShopping({ version: 1 }).errors.length).toBeGreaterThan(0)
    expect(validateShopping(null).errors.length).toBeGreaterThan(0)
  })
})
