import { describe, expect, it } from 'vitest'

import { newSettlement, settlementDirection } from './settlement'

describe('costruire un rimborso', () => {
  /* Il saldo è positivo: l'altra persona deve a chi guarda. */
  const base = {
    owedToViewer: 393.04,
    viewer: 'me',
    other: 'partner',
    amount: 393.04,
    date: '2026-08-27',
  } as const

  it('il verso lo ricava dal saldo, e chi chiama non lo decide', () => {
    const s = newSettlement(base)!
    expect(s.from).toBe('partner')
    expect(s.to).toBe('me')
  })

  it('col saldo di segno opposto il rimborso va dall’altra parte', () => {
    const s = newSettlement({ ...base, owedToViewer: -393.04 })!
    expect(s.from).toBe('me')
    expect(s.to).toBe('partner')
  })

  /* È il caso della pagina Saldo: si rimborsa un pezzo, il verso resta quello
     del debito complessivo. */
  it('un rimborso parziale tiene il verso del saldo intero', () => {
    const s = newSettlement({ ...base, amount: 50 })!
    expect(s.from).toBe('partner')
    expect(s.amount).toBe(50)
  })

  /* Il verso sta già in `from`/`to`: un importo negativo lo direbbe due volte,
     e le due voci potrebbero non essere d'accordo. */
  it('l’importo è sempre positivo, anche se arriva negativo', () => {
    expect(newSettlement({ ...base, amount: -393.04 })?.amount).toBe(393.04)
  })

  it('arrotonda al centesimo', () => {
    expect(newSettlement({ ...base, amount: 10.005 })?.amount).toBe(10.01)
    expect(newSettlement({ ...base, amount: 10.004 })?.amount).toBe(10)
  })

  /* L'importo arriva da un campo scritto col pollice: «non è un importo» è un
     esito previsto, e chi chiama lo dice a modo suo. */
  it('torna null su quello che non è un importo', () => {
    expect(newSettlement({ ...base, amount: 0 })).toBeNull()
    expect(newSettlement({ ...base, amount: -0 })).toBeNull()
    expect(newSettlement({ ...base, amount: Number.NaN })).toBeNull()
    expect(newSettlement({ ...base, amount: Number.POSITIVE_INFINITY })).toBeNull()
  })

  /* In pari non c'è niente da rimborsare, e un verso non si potrebbe nemmeno
     scegliere: senza questa guardia il debito finirebbe sempre da una parte. */
  it('torna null se siete in pari', () => {
    expect(newSettlement({ ...base, owedToViewer: 0 })).toBeNull()
    expect(newSettlement({ ...base, owedToViewer: 0.001 })).toBeNull()
  })

  it('l’id porta la data del rimborso', () => {
    expect(newSettlement(base)?.id).toContain('2026-08-27')
  })
})

/* La frase che annuncia il verso e il rimborso che lo esegue devono venire
   dalla stessa regola: è l'unico modo perché non possano contraddirsi. */
describe('il verso, da solo', () => {
  it('saldo positivo: paga l’altra persona', () => {
    expect(settlementDirection(10, 'me', 'partner')).toEqual({ debtor: 'partner', creditor: 'me' })
  })

  it('saldo negativo: paghi tu', () => {
    expect(settlementDirection(-10, 'me', 'partner')).toEqual({ debtor: 'me', creditor: 'partner' })
  })

  it('è lo stesso verso che finisce nel rimborso', () => {
    for (const saldo of [42, -42]) {
      const verso = settlementDirection(saldo, 'me', 'partner')
      const s = newSettlement({ owedToViewer: saldo, viewer: 'me', other: 'partner', amount: 42, date: '2026-08-27' })!
      expect(s.from).toBe(verso.debtor)
      expect(s.to).toBe(verso.creditor)
    }
  })
})
