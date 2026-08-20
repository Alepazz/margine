import { describe, expect, it } from 'vitest'

import { formatEuro, relativeChange, sanitizeAmount, splitHalf, sumEuro, toCents } from './money'

describe('somme in euro', () => {
  it('non accumula errori in virgola mobile', () => {
    // 0.1 + 0.2 in virgola mobile fa 0.30000000000000004
    expect(sumEuro([0.1, 0.2])).toBe(0.3)
  })

  it('somma esattamente centinaia di importi con i centesimi', () => {
    const values = Array.from({ length: 300 }, () => 10.07)
    expect(sumEuro(values)).toBe(3021)
  })
})

describe('divisione a metà', () => {
  it('somma sempre esattamente all’originale', () => {
    for (const amount of [10, 10.01, 0.01, 85, 33.33, 118.55]) {
      const [a, b] = splitHalf(amount)
      expect(toCents(a) + toCents(b)).toBe(toCents(amount))
    }
  })

  it('dà il centesimo dispari alla prima metà', () => {
    expect(splitHalf(10.01)).toEqual([5.01, 5])
  })
})

describe('formattazione', () => {
  /** Intl separa il simbolo con uno spazio insecabile: qui lo normalizziamo. */
  const plain = (value: string) => value.replace(/ | /g, ' ')

  it('usa la convenzione italiana', () => {
    expect(plain(formatEuro(1234.5))).toBe('1234,50 €')
    expect(plain(formatEuro(1234.5, { decimals: 0 }))).toBe('1235 €')
  })

  it('raggruppa le migliaia solo da cinque cifre, come vuole l’italiano', () => {
    // In italiano (CLDR) il separatore compare da 10.000: «1234» resta senza punto.
    expect(plain(formatEuro(12345.5))).toBe('12.345,50 €')
  })
})

describe('variazione relativa', () => {
  it('è nulla quando non c’è una base con cui confrontare', () => {
    expect(relativeChange(100, 0)).toBeNull()
  })

  it('calcola la variazione', () => {
    expect(relativeChange(120, 100)).toBeCloseTo(0.2)
    expect(relativeChange(80, 100)).toBeCloseTo(-0.2)
  })
})

describe('quello che si scrive in un campo importo', () => {
  it('lascia passare solo cifre e un separatore', () => {
    expect(sanitizeAmount('47,30')).toBe('47,30')
    expect(sanitizeAmount('47')).toBe('47')
    expect(sanitizeAmount('')).toBe('')
  })

  it('butta via le lettere, anche incollate in mezzo', () => {
    expect(sanitizeAmount('12abc,5')).toBe('12,5')
    expect(sanitizeAmount('€ 47,30')).toBe('47,30')
    expect(sanitizeAmount('ciao')).toBe('')
  })

  /* Sulla tastiera del Mac esce il punto, sul tastierino del telefono la virgola:
     nel campo si vede una virgola in entrambi i casi. */
  it('normalizza il punto in virgola, e tiene solo il primo separatore', () => {
    expect(sanitizeAmount('12.5')).toBe('12,5')
    expect(sanitizeAmount('12,5,7')).toBe('12,57')
    expect(sanitizeAmount('1.234,56')).toBe('1,23')
  })

  it('si ferma a due decimali, perché l’unità è il centesimo', () => {
    expect(sanitizeAmount('10,999')).toBe('10,99')
    expect(sanitizeAmount('10,')).toBe('10,')
  })
})
