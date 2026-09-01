import { describe, expect, it } from 'vitest'

import { aTo, diCuiLabel, nameKey } from './text'

describe('la chiave di un nome', () => {
  it('collassa spazi e maiuscole', () => {
    expect(nameKey('  Spesa   COOP ')).toBe('spesa coop')
  })

  /* Gli accenti restano: in italiano distinguono parole. */
  it('non tocca gli accenti', () => {
    expect(nameKey('Però')).not.toBe(nameKey('Pero'))
  })
})

/*
 * Vive nel dominio perché una regola di lingua italiana non è di nessuna pagina
 * in particolare — e perché appena un secondo posto ha avuto bisogno della
 * stessa frase è tornata a mancare: il saldo nel Riepilogo diceva «Devi 123 € a
 * Alessio» (cifra d'esempio: → ADR-0067).
 */
describe('la d eufonica', () => {
  it('mette «ad» davanti a vocale', () => {
    expect(aTo('Alessio')).toBe('ad')
    expect(aTo('Elena')).toBe('ad')
    expect(aTo('Ilaria')).toBe('ad')
    expect(aTo('Ombretta')).toBe('ad')
    expect(aTo('Ugo')).toBe('ad')
  })

  it('mette «a» davanti a consonante', () => {
    expect(aTo('Federica')).toBe('a')
    expect(aTo('Marco')).toBe('a')
  })

  it('non si fa ingannare da spazi o minuscole', () => {
    expect(aTo('  anna ')).toBe('ad')
    expect(aTo(' Betto')).toBe('a')
  })

  /* I nomi arrivano dalla configurazione: possono essere accentati. */
  it('regge le vocali accentate', () => {
    expect(aTo('Ève')).toBe('ad')
  })
})

/*
 * Il «di cui» del saldo. Il caso che conta non è quello facile — «539 € di cui
 * 200 di mutuo» — ma quello in cui la rata tira **dall'altra parte**: lì «di
 * cui» direbbe il falso, perché quel numero non è dentro il totale, lo abbassa.
 * È l'unica ragione per cui questa frase è una funzione. → ADR-0081
 */
describe('il «di cui» del saldo', () => {
  const euro = (value: number): string => `${value} €`

  it('dice «di cui» quando la rata pende dalla stessa parte del saldo', () => {
    expect(
      diCuiLabel({ delta: 200, balance: 539, label: 'Mutuo', month: 'Settembre', format: euro }),
    ).toBe('di cui 200 € di mutuo di settembre')
    /* Anche a saldo negativo, purché i due concordino. */
    expect(
      diCuiLabel({ delta: -200, balance: -539, label: 'Mutuo', month: 'Settembre', format: euro }),
    ).toBe('di cui 200 € di mutuo di settembre')
  })

  it('cambia frase quando la rata pende dall’altra parte', () => {
    expect(
      diCuiLabel({ delta: -200, balance: 539, label: 'Mutuo', month: 'Settembre', format: euro }),
    ).toBe("200 € di mutuo di settembre tirano dall'altra parte")
  })

  it('a saldo pari «di cui» resta lecito: non c’è un verso da contraddire', () => {
    expect(
      diCuiLabel({ delta: 200, balance: 0, label: 'Mutuo', month: 'Settembre', format: euro }),
    ).toBe('di cui 200 € di mutuo di settembre')
  })

  it('senza rata non dice niente', () => {
    expect(
      diCuiLabel({ delta: 0, balance: 539, label: 'Mutuo', month: 'Settembre', format: euro }),
    ).toBeNull()
  })
})
