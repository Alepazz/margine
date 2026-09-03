/**
 * Le regole di una carta nel browser e quelle della sessione al Mac.
 *
 * Sono due implementazioni della stessa cosa — `src/domain/cards.ts` per il
 * modulo di inserimento, `validate-core.mjs` per `npm run encrypt` — come
 * accade per le spese e per la cifratura, che hanno lo stesso tipo di test.
 *
 * La garanzia è **in una direzione sola**, ed è quella che conta: se l'app
 * accetta una carta, `npm run encrypt` non deve rifiutarla e lasciare i dati
 * non pubblicati. Il contrario non vale di proposito — la validazione dei file
 * tollera con un avviso due carte con lo stesso codice, mentre nel modulo non
 * c'è modo di produrle.
 *
 * Vive qui, fra gli script, per la stessa ragione dell'altro test di parità: a
 * raggiungere il mondo non tipizzato è il file non tipizzato.
 */

import { describe, expect, it } from 'vitest'

import { validateCard } from '../../src/domain/cards.ts'
import { validateCards } from './validate-core.mjs'

function base(overrides = {}) {
  return {
    id: 'carta-2026-09-02-a1b2c3d4',
    name: 'Supermercato A',
    code: '0999888777664',
    format: 'ean13',
    addedAt: '2026-09-02',
    ...overrides,
  }
}

/** Il file come lo scrive la migrazione, con una carta dentro. */
function file(card) {
  return { version: 1, updatedAt: '2026-09-02T09:00:00.000Z', cards: [card] }
}

/** Le carte che il modulo deve poter salvare: nessuna può bloccare la pubblicazione. */
const ACCETTABILI = [
  ['un EAN-13 con la cifra di controllo giusta', base()],
  ['un EAN-8', base({ code: '96385074', format: 'ean8' })],
  ['un Code 128 di sole cifre', base({ code: '12345678901234', format: 'code128' })],
  ['un Code 128 con lettere e segni', base({ code: 'ABC-1234/xyz', format: 'code128' })],
  ['un Code 39', base({ code: 'ABC123', format: 'code39' })],
  ['un ITF di lunghezza pari', base({ code: '00123456789012', format: 'itf' })],
  ['una carta senza codice a barre', base({ code: '333 1234567', format: 'text' })],
  ['una carta a QR, che si salva per il numero', base({ code: 'ABC123', format: 'qr' })],
  ['con nota, colore e faccia', base({ note: 'Cliente 4471', color: '#1d4ed8', image: 'data:image/png;base64,iVBORw0KGgo=' })],
]

/** Quelle che il modulo deve rifiutare, e che l'import non deve pubblicare. */
const RIFIUTABILI = [
  ['senza nome', base({ name: '  ' })],
  /*
   * Una carta a QR **senza numero**. Il caso che conta più di tutti: se l'app la
   * accettasse e la pubblicazione la rifiutasse, `npm run encrypt` non
   * scriverebbe **nessuno** dei tre file — si fermerebbero anche spese e
   * configurazione — e dal telefono non ci sarebbe modo di capirlo.
   */
  ['a QR senza numero', base({ code: '', format: 'qr' })],
  ['senza numero, in ogni formato', base({ code: '   ' })],
  /* Il `*` delimita un Code 39: dentro i dati produce un codice che si
     interrompe a metà, cioè illeggibile invece che assente. */
  ['Code 39 con un asterisco', base({ code: 'AB*CD', format: 'code39' })],
  ['data che non esiste', base({ addedAt: '2026-02-30' })],
  ['EAN-13 con la cifra di controllo sbagliata', base({ code: '0999888777665' })],
  ['EAN-13 troppo corto', base({ code: '12345' })],
  ['EAN-8 con la cifra sbagliata', base({ code: '96385075', format: 'ean8' })],
  ['ITF di lunghezza dispari', base({ code: '12345', format: 'itf' })],
  ['Code 39 con un carattere non ammesso', base({ code: 'ciao!', format: 'code39' })],
  ['Code 128 con un accento', base({ code: 'caffè', format: 'code128' })],
  ['formato inventato', base({ format: 'pdf417' })],
  ['data impossibile', base({ addedAt: '2026-13-02' })],
  ['colore che non è un colore', base({ color: 'blu' })],
  ['immagine che è un collegamento', base({ image: 'https://example.com/logo.png' })],
]

describe('regole di una carta: il browser e la pubblicazione concordano', () => {
  for (const [nome, card] of ACCETTABILI) {
    it(`accettano entrambi ${nome}`, () => {
      expect(validateCard(card, new Set())).toEqual([])
      expect(validateCards(file(card)).errors).toEqual([])
    })
  }

  for (const [nome, card] of RIFIUTABILI) {
    it(`rifiutano entrambi ${nome}`, () => {
      expect(validateCard(card, new Set()).length).toBeGreaterThan(0)
      expect(validateCards(file(card)).errors.length).toBeGreaterThan(0)
    })
  }

  it('il tetto dell’immagine è lo stesso nei due posti', () => {
    /* Il numero vive due volte, e se divergesse l'app salverebbe una carta che
       la pubblicazione poi rifiuta — con i dati fermi e nessun modo di capirlo
       dal telefono. */
    const grossa = base({ image: `data:image/png;base64,${'A'.repeat(28_000)}` })
    expect(validateCard(grossa, new Set()).length).toBeGreaterThan(0)
    expect(validateCards(file(grossa)).errors.length).toBeGreaterThan(0)
  })

  it('due carte con lo stesso codice sono un avviso, non un errore', () => {
    /* Nel modulo non si possono produrre; nei dati sì, e quasi sempre è la
       stessa carta inserita da due telefoni — ma due tessere dello stesso
       circuito possono averlo davvero. */
    const doppio = {
      version: 1,
      updatedAt: '2026-09-02T09:00:00.000Z',
      cards: [base(), base({ id: 'carta-2026-09-02-ffffffff', name: 'Supermercato B' })],
    }
    const verdetto = validateCards(doppio)
    expect(verdetto.errors).toEqual([])
    expect(verdetto.warnings.length).toBe(1)
  })
})
