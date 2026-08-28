import { describe, expect, it } from 'vitest'

import { aTo, nameKey } from './text'

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
