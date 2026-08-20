import { describe, expect, it } from 'vitest'

import { ledgerKeyOf, ledgerOptions, ledgerParts, presetOf, sharesFor, splitFor } from './expense-rules'
import { toCents } from './money'
import type { Expense, Payer, PersonId, Source, Trip } from './types'

describe('come si divide una spesa', () => {
  it('«tutta mia» parla di chi guarda, non di una chiave fissa', () => {
    expect(splitFor('mine', 30, 'me', 'me')).toEqual({ me: 30, partner: 0 })
    expect(splitFor('mine', 30, 'me', 'partner')).toEqual({ me: 0, partner: 30 })
    expect(splitFor('theirs', 30, 'me', 'me')).toEqual({ me: 0, partner: 30 })
    expect(splitFor('theirs', 30, 'me', 'partner')).toEqual({ me: 30, partner: 0 })
  })

  it('una metà pari si divide senza discussioni', () => {
    expect(splitFor('half', 30, 'me', 'me')).toEqual({ me: 15, partner: 15 })
    expect(splitFor('half', 30, 'partner', 'partner')).toEqual({ me: 15, partner: 15 })
  })

  it('il centesimo dispari va a chi ha pagato, come su Tricount', () => {
    /* 14,95 non si divide in due: 7,47 a uno e 7,48 all'altro. Tricount dà il
       centesimo in più a chi ha anticipato, e il saldo che mostra è calcolato
       così — 81 centesimi di divario su un tricount solo. → ADR-0023 */
    expect(splitFor('half', 14.95, 'me', 'me')).toEqual({ me: 7.48, partner: 7.47 })
    expect(splitFor('half', 14.95, 'partner', 'me')).toEqual({ me: 7.47, partner: 7.48 })
  })

  it('NON dipende da chi guarda: è la proprietà che il vecchio codice rompeva', () => {
    /*
     * Prima il centesimo andava «a chi guarda», quindi la stessa spesa inserita
     * da Alessio o da Federica si divideva in due modi diversi. Niente se ne
     * accorgeva: le quote sommavano all'importo in entrambi i casi.
     */
    for (const paidBy of ['me', 'partner', 'others'] as Payer[]) {
      for (const amount of [14.95, 0.01, 3.33, 999.99]) {
        const daAlessio = splitFor('half', amount, paidBy, 'me')
        const daFederica = splitFor('half', amount, paidBy, 'partner')
        expect(daFederica).toEqual(daAlessio)
      }
    }
  })

  it('un pagante fuori dalla coppia non manda la regola in ballo', () => {
    /* Il centesimo va a `partner` per convenzione: conta solo che sia sempre
       lo stesso, non chi sia. */
    expect(splitFor('half', 14.95, 'others', 'me')).toEqual({ me: 7.47, partner: 7.48 })
    expect(splitFor('half', 14.95, 'others', 'partner')).toEqual({ me: 7.47, partner: 7.48 })
  })

  it('le quote sommano sempre esattamente all’importo', () => {
    /* L'invariante di ADR-0007: vale per ogni preset, ogni pagante, ogni vista. */
    for (const preset of ['half', 'mine', 'theirs'] as const) {
      for (const paidBy of ['me', 'partner', 'others'] as Payer[]) {
        for (const person of ['me', 'partner'] as PersonId[]) {
          for (const cents of [1, 3, 7, 1495, 33333]) {
            const amount = cents / 100
            const split = splitFor(preset, amount, paidBy, person)
            expect(toCents(split.me) + toCents(split.partner)).toBe(cents)
          }
        }
      }
    }
  })

  it('«a mano» non inventa numeri', () => {
    expect(splitFor('custom', 30, 'me', 'me')).toEqual({ me: 0, partner: 0 })
  })
})

describe('riconoscere la divisione di una spesa che esiste già', () => {
  const base = (shares: { me: number; partner: number }, amount: number): Expense => ({
    id: 'x',
    date: '2026-08-20',
    title: 'Voce',
    amount,
    shares,
    paidBy: 'me',
    source: 'condivise',
    category: 'spesa',
    recurring: false,
  })

  it('una metà dispari resta una metà, da qualunque lato stia il centesimo', () => {
    expect(presetOf(base({ me: 7.48, partner: 7.47 }, 14.95), 'me')).toBe('half')
    expect(presetOf(base({ me: 7.47, partner: 7.48 }, 14.95), 'me')).toBe('half')
    expect(presetOf(base({ me: 7.48, partner: 7.47 }, 14.95), 'partner')).toBe('half')
  })

  it('e il giro completo torna al punto di partenza', () => {
    /* Aprire una spesa in correzione e risalvarla senza toccare niente non deve
       spostarle un centesimo. */
    for (const person of ['me', 'partner'] as PersonId[]) {
      const expense = base(splitFor('half', 14.95, 'me', 'me'), 14.95)
      const preset = presetOf(expense, person)
      expect(preset).toBe('half')
      expect(splitFor(preset, 14.95, expense.paidBy, person)).toEqual(expense.shares)
    }
  })

  it('riconosce «tutta mia» e «tutta sua» dal lato giusto', () => {
    const tuttaMia = base({ me: 30, partner: 0 }, 30)
    expect(presetOf(tuttaMia, 'me')).toBe('mine')
    expect(presetOf(tuttaMia, 'partner')).toBe('theirs')
  })
})

describe('la traduzione fra chi guarda e le chiavi fisse', () => {
  it('scambia le quote solo per chi non è «me»', () => {
    expect(sharesFor('me', 10, 20)).toEqual({ me: 10, partner: 20 })
    expect(sharesFor('partner', 10, 20)).toEqual({ me: 20, partner: 10 })
  })
})

describe('la chiave del tricount', () => {
  const trip = (id: string, start: string, closed?: boolean): Trip => ({
    id,
    name: id,
    place: id,
    year: Number(start.slice(0, 4)),
    start,
    end: start,
    ...(closed ? { closed } : {}),
  })

  it('va e torna: chiave → campi → chiave', () => {
    for (const key of ['fisse', 'personali', 'condivise', 'vacanze/creta-2025']) {
      expect(ledgerKeyOf(ledgerParts(key) as { source: Source; trip?: string })).toBe(key)
    }
  })

  it('una spesa di vacanza senza viaggio non finge di averne uno', () => {
    expect(ledgerKeyOf({ source: 'vacanze' })).toBe('vacanze')
    expect(ledgerParts('vacanze')).toEqual({ source: 'vacanze' })
  })

  it('offre i tre tricount fissi più le vacanze aperte, dalla più recente', () => {
    const options = ledgerOptions([
      trip('vecchia-2024', '2024-05-01'),
      trip('nuova-2026', '2026-07-01'),
    ])
    expect(options.map((o) => o.key)).toEqual([
      'condivise',
      'personali',
      'fisse',
      'vacanze/nuova-2026',
      'vacanze/vecchia-2024',
    ])
  })

  it('nasconde le vacanze concluse', () => {
    const options = ledgerOptions([trip('finita-2024', '2024-05-01', true)])
    expect(options.map((o) => o.key)).not.toContain('vacanze/finita-2024')
  })

  /*
   * Il difetto che questo presidia: aprendo in correzione una spesa di una
   * vacanza conclusa, un menù che non contiene il suo tricount mostrerebbe il
   * primo della lista — e salvare la sposterebbe in un altro tricount senza che
   * nessuno l'abbia chiesto.
   */
  it('ma tiene quella della spesa che si sta correggendo, marcata', () => {
    const options = ledgerOptions([trip('finita-2024', '2024-05-01', true)], {
      current: 'vacanze/finita-2024',
    })
    const found = options.find((o) => o.key === 'vacanze/finita-2024')
    expect(found?.closed).toBe(true)
  })
})
