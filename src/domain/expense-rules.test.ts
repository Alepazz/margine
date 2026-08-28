import { describe, expect, it } from 'vitest'

import { presetOf, sharesFor, splitFor, tricountOptions, validateExpense } from './expense-rules'
import { toCents } from './money'
import type { Expense, Payer, PersonId, Tricount } from './types'

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
    /* 10,01 non si divide in due: 5,00 a uno e 5,01 all'altro. Tricount dà il
       centesimo in più a chi ha anticipato, e il saldo che mostra è calcolato
       così — 81 centesimi di divario su un tricount solo. → ADR-0023 */
    expect(splitFor('half', 10.01, 'me', 'me')).toEqual({ me: 5.01, partner: 5 })
    expect(splitFor('half', 10.01, 'partner', 'me')).toEqual({ me: 5, partner: 5.01 })
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
    tricount: 'condivise',
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

describe('i tricount fra cui scegliere', () => {
  const shared = (id: string): Tricount => ({ id, name: id, members: ['me', 'partner'] })
  const trip = (id: string, start: string, closed?: boolean): Tricount => ({
    id,
    name: id,
    members: ['me', 'partner'],
    ...(closed ? { closed } : {}),
    trip: { place: id, year: Number(start.slice(0, 4)), start, end: start },
  })
  const personale = (id: string, who: PersonId): Tricount => ({ id, name: id, members: [who] })

  const TRICOUNTS: Tricount[] = [
    shared('condivise'),
    personale('personali-a', 'me'),
    personale('personali-b', 'partner'),
    shared('fisse'),
    trip('vecchia-2024', '2024-05-01'),
    trip('nuova-2026', '2026-07-01'),
  ]

  it('offre i registri stabili più le vacanze aperte, dalla più recente', () => {
    const options = tricountOptions(TRICOUNTS, 'me')
    expect(options.map((o) => o.tricount.id)).toEqual([
      'condivise',
      'personali-a',
      'fisse',
      'nuova-2026',
      'vecchia-2024',
    ])
  })

  /*
   * La separazione in scrittura, per costruzione: il compartimento personale
   * dell'altra persona **non compare**, quindi sbagliare tricount verso il suo
   * non è vietato — è impossibile. → ADR-0037
   */
  it('non offre mai il personale dell’altra persona', () => {
    const perLei = tricountOptions(TRICOUNTS, 'partner')
    expect(perLei.map((o) => o.tricount.id)).not.toContain('personali-a')
    expect(perLei.map((o) => o.tricount.id)).toContain('personali-b')
  })

  it('nasconde le vacanze concluse', () => {
    const options = tricountOptions([trip('finita-2024', '2024-05-01', true)], 'me')
    expect(options.map((o) => o.tricount.id)).not.toContain('finita-2024')
  })

  /*
   * Il difetto che questo presidia: aprendo in correzione una spesa di una
   * vacanza conclusa, un menù che non contiene il suo tricount mostrerebbe il
   * primo della lista — e salvare la sposterebbe in un altro tricount senza che
   * nessuno l'abbia chiesto.
   */
  it('ma tiene quella della spesa che si sta correggendo, marcata', () => {
    const options = tricountOptions([trip('finita-2024', '2024-05-01', true)], 'me', {
      current: 'finita-2024',
    })
    const found = options.find((o) => o.tricount.id === 'finita-2024')
    expect(found?.closed).toBe(true)
  })
})

describe('le quote appartengono ai membri', () => {
  const CATEGORIES = [{ id: 'spesa', label: 'Spesa' }]
  const TRICOUNTS: Tricount[] = [
    { id: 'condivise', name: 'Condivise', members: ['me', 'partner'] },
    { id: 'personali-a', name: 'Personale', members: ['me'] },
  ]
  const ctx = { categories: CATEGORIES, tricounts: TRICOUNTS, takenIds: new Set<string>() }
  const base = (overrides: Partial<Expense>): Expense => ({
    id: 'x1',
    date: '2026-08-21',
    title: 'Voce',
    amount: 30,
    shares: { me: 30, partner: 0 },
    paidBy: 'me',
    tricount: 'personali-a',
    category: 'spesa',
    recurring: false,
    ...overrides,
  })

  it('in un tricount con un membro solo la quota dell’altro è zero', () => {
    expect(validateExpense(base({}), ctx)).toEqual([])
    const sbagliata = base({ shares: { me: 15, partner: 15 } })
    expect(validateExpense(sbagliata, ctx).join(' ')).toContain('non ne fa parte')
  })

  /* Il pagante è un fatto accaduto: una spesa personale anticipata dall'altra
     persona è un debito, non un errore. → ADR-0028 */
  it('ma il pagante può essere chiunque', () => {
    const anticipata = base({ paidBy: 'partner' })
    expect(validateExpense(anticipata, ctx)).toEqual([])
  })

  it('la quota di terzi e il pagante di gruppo esistono solo in vacanza', () => {
    const conTerzi = base({
      tricount: 'condivise',
      amount: 90,
      shares: { me: 30, partner: 30, others: 30 },
    })
    expect(validateExpense(conTerzi, ctx).join(' ')).toContain('vacanza')
    const pagataDaGruppo = base({ tricount: 'condivise', shares: { me: 15, partner: 15 }, paidBy: 'others' })
    expect(validateExpense(pagataDaGruppo, ctx).join(' ')).toContain('vacanza')
  })

  it('una spesa in un tricount che non esiste non si salva', () => {
    expect(validateExpense(base({ tricount: 'fantasma' }), ctx).join(' ')).toContain('tricount')
  })
})
