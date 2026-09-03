import { describe, expect, it } from 'vitest'

import { formatOptions, inkOn, sortCards, validateCard, MAX_IMAGE_CHARS } from './cards'
import type { LoyaltyCard } from './types'

function card(over: Partial<LoyaltyCard> = {}): LoyaltyCard {
  return {
    id: 'carta-2026-09-02-a1b2c3d4',
    name: 'Supermercato A',
    code: '0999888777664',
    format: 'ean13',
    addedAt: '2026-09-02',
    ...over,
  }
}

describe('cosa si può salvare', () => {
  it('una carta buona non ha problemi', () => {
    expect(validateCard(card(), new Set())).toEqual([])
  })

  it('rifiuta un codice che non sta nel suo formato', () => {
    /* È il controllo che conta: una carta salvata così alla cassa non passa, e
       lo si scopre là. */
    const problems = validateCard(card({ code: '0999888777665' }), new Set())
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('dovrebbe essere 4')
  })

  it('vuole il nome del negozio', () => {
    expect(validateCard(card({ name: '  ' }), new Set())).toContain('Serve il nome del negozio.')
  })

  it('rifiuta un id già preso', () => {
    expect(validateCard(card(), new Set(['carta-2026-09-02-a1b2c3d4']))).toContain(
      'Questo id di carta esiste già.',
    )
  })

  it('una carta senza codice a barre è legittima', () => {
    /* Quelle che si danno col numero di telefono: non è un ripiego, è un caso
       vero, e il modulo deve poterle salvare. */
    expect(validateCard(card({ format: 'text', code: '333 1234567' }), new Set())).toEqual([])
  })

  it('una carta a QR si salva, perché il numero serve comunque', () => {
    expect(validateCard(card({ format: 'qr', code: 'ABC123' }), new Set())).toEqual([])
  })

  it('rifiuta un’immagine che non è incorporata', () => {
    expect(validateCard(card({ image: 'https://example.com/logo.png' }), new Set())).toHaveLength(1)
  })

  it('rifiuta un’immagine oltre il tetto', () => {
    /* Il tetto esiste per la coda in `localStorage`, dove il browser concede
       circa cinque megabyte in tutto: una foto dalla galleria li riempie. */
    const grossa = `data:image/png;base64,${'A'.repeat(MAX_IMAGE_CHARS)}`
    expect(validateCard(card({ image: grossa }), new Set())).toContain(
      'L’immagine della tessera è troppo grande: va ridotta prima di salvarla.',
    )
  })

  it('accetta un’immagine incorporata piccola', () => {
    expect(validateCard(card({ image: 'data:image/png;base64,iVBORw0KGgo=' }), new Set())).toEqual([])
  })

  it('vuole il colore nella forma #rrggbb', () => {
    expect(validateCard(card({ color: 'blu' }), new Set())).toHaveLength(1)
    expect(validateCard(card({ color: '#1d4ed8' }), new Set())).toEqual([])
  })
})

describe('i formati che il modulo propone', () => {
  it('non offre il QR, che non sappiamo disegnare', () => {
    expect(formatOptions()).not.toContain('qr')
  })

  it('mostra però il formato della carta che si sta correggendo', () => {
    /* Un menù che non contiene il valore corrente lo cambierebbe da sé: qui
       trasformerebbe una carta a QR in un EAN-13 senza che nessuno l'abbia
       chiesto. È la regola del selettore dei tricount. → ADR-0027 */
    expect(formatOptions('qr')[0]).toBe('qr')
  })
})

describe('l’ordine dell’elenco', () => {
  const carte = [
    card({ id: 'b', name: 'Zeta' }),
    card({ id: 'a', name: 'alfa' }),
    card({ id: 'c', name: 'Mezzo' }),
  ]

  it('per nome ignora maiuscole e accenti', () => {
    expect(sortCards(carte, 'nome').map((c) => c.name)).toEqual(['alfa', 'Mezzo', 'Zeta'])
  })

  it('per uso recente mette davanti l’ultima aperta', () => {
    const ordinate = sortCards(carte, 'recenti', { b: 200, c: 100 })
    expect(ordinate.map((c) => c.id)).toEqual(['b', 'c', 'a'])
  })

  it('le mai usate tornano in ordine di nome, non in ordine casuale', () => {
    /* Un ordine che cambia da sé fra due aperture non è un ordine. */
    expect(sortCards(carte, 'recenti').map((c) => c.name)).toEqual(['alfa', 'Mezzo', 'Zeta'])
  })

  it('non tocca l’elenco che riceve', () => {
    const originale = [...carte]
    sortCards(carte, 'nome')
    expect(carte).toEqual(originale)
  })
})

describe('il testo sopra la fascia colorata', () => {
  it('scrive scuro sui colori chiari e chiaro sugli scuri', () => {
    expect(inkOn('#ffffff')).toBe('scuro')
    expect(inkOn('#f2f5f7')).toBe('scuro')
    expect(inkOn('#1d4ed8')).toBe('chiaro')
    expect(inkOn('#000000')).toBe('chiaro')
  })

  it('pesa il verde più del blu, come fa l’occhio', () => {
    /* Sulla media dei canali questi due sarebbero lo stesso colore, e uno dei
       due testi risulterebbe illeggibile. */
    expect(inkOn('#00ff00')).toBe('scuro')
    expect(inkOn('#0000ff')).toBe('chiaro')
  })

  it('su un valore che non è un colore non azzarda: chiaro', () => {
    /* Il caso «nessun colore» non arriva più qui: senza tinta le pagine usano
       l'inchiostro del tema, perché un ripiego scriveva bianco su bianco. */
    expect(inkOn('non-un-colore')).toBe('chiaro')
  })
})
