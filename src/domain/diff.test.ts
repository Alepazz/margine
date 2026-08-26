import { describe, expect, it } from 'vitest'

import { FIELD_LABELS, changedFields, diffExpenses, visibleDeltas } from './diff'
import type { Dataset, Expense, Tricount } from './types'

function expense(over: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    date: '2026-08-20',
    title: 'Spesa Coop',
    amount: 34.36,
    shares: { me: 17.18, partner: 17.18 },
    paidBy: 'partner',
    tricount: 'condivise',
    category: 'cibo',
    recurring: false,
    ...over,
  }
}

function dataset(expenses: Expense[]): Dataset {
  return {
    version: 1,
    updatedAt: '2026-08-26T10:00:00.000Z',
    expenses,
    tricounts: [],
    settlements: [],
    prices: [],
  } as unknown as Dataset
}

describe('confronto fra due versioni', () => {
  it('trova le spese comparse', () => {
    const before = dataset([expense({ id: 'a' })])
    const after = dataset([expense({ id: 'a' }), expense({ id: 'b', title: 'Benzina' })])
    const deltas = diffExpenses(before, after)
    expect(deltas).toHaveLength(1)
    expect(deltas[0]?.kind).toBe('added')
    expect(deltas[0]?.expense.title).toBe('Benzina')
  })

  it('trova le spese sparite, e ne conserva com’erano', () => {
    const before = dataset([expense({ id: 'a', title: 'Vecchia' })])
    const after = dataset([])
    const deltas = diffExpenses(before, after)
    expect(deltas[0]?.kind).toBe('removed')
    expect(deltas[0]?.expense.title).toBe('Vecchia')
  })

  it('trova le modifiche e tiene il prima', () => {
    const before = dataset([expense({ id: 'a', amount: 10 })])
    const after = dataset([expense({ id: 'a', amount: 12 })])
    const deltas = diffExpenses(before, after)
    expect(deltas[0]?.kind).toBe('changed')
    expect(deltas[0]?.before?.amount).toBe(10)
    expect(deltas[0]?.expense.amount).toBe(12)
  })

  it('una spesa identica non è una modifica', () => {
    const uno = dataset([expense({ id: 'a' })])
    const due = dataset([expense({ id: 'a' })])
    expect(diffExpenses(uno, due)).toEqual([])
  })

  /*
   * Il confronto non deve dipendere dall'ordine in cui le chiavi finiscono
   * nell'oggetto: due file cifrati scritti in momenti diversi possono
   * serializzare lo stesso dato in ordine diverso, e ogni spesa risulterebbe
   * «modificata» a ogni rilettura.
   */
  it('l’ordine delle chiavi non conta', () => {
    const a = expense({ id: 'a' })
    /* Le stesse chiavi, scritte in ordine inverso: il confronto deve reggere. */
    const b = Object.fromEntries(Object.entries(a).reverse()) as unknown as Expense
    expect(Object.keys(b)).not.toEqual(Object.keys(a))
    expect(diffExpenses(dataset([a]), dataset([b]))).toEqual([])
  })

  it('una chiave assente e una a undefined sono la stessa cosa', () => {
    const senza = expense({ id: 'a' })
    const conUndefined = { ...senza, subcategory: undefined }
    expect(diffExpenses(dataset([senza]), dataset([conUndefined]))).toEqual([])
  })

  it('prima le aggiunte, poi le modifiche, poi le eliminazioni', () => {
    const before = dataset([expense({ id: 'vecchia' }), expense({ id: 'tocca', amount: 1 })])
    const after = dataset([expense({ id: 'tocca', amount: 2 }), expense({ id: 'nuova' })])
    expect(diffExpenses(before, after).map((d) => d.kind)).toEqual(['added', 'changed', 'removed'])
  })
})

describe('la separazione dei compartimenti personali', () => {
  const tricounts = [
    { id: 'condivise', name: 'Spese condivise', members: ['me', 'partner'] },
    { id: 'personali-me', name: 'Le mie spese', members: ['me'] },
    { id: 'personali-partner', name: 'Le sue spese', members: ['partner'] },
  ] as unknown as Tricount[]

  it('mostra solo i tricount di cui sono membro', () => {
    const deltas = diffExpenses(
      dataset([]),
      dataset([
        expense({ id: 'a', tricount: 'condivise' }),
        expense({ id: 'b', tricount: 'personali-me' }),
        expense({ id: 'c', tricount: 'personali-partner' }),
      ]),
    )
    expect(visibleDeltas(deltas, tricounts, 'me').map((d) => d.expense.id).sort()).toEqual(['a', 'b'])
  })

  it('e il verso opposto, per l’altra persona', () => {
    const deltas = diffExpenses(
      dataset([]),
      dataset([
        expense({ id: 'a', tricount: 'condivise' }),
        expense({ id: 'c', tricount: 'personali-partner' }),
      ]),
    )
    expect(visibleDeltas(deltas, tricounts, 'partner').map((d) => d.expense.id).sort()).toEqual([
      'a',
      'c',
    ])
  })

  it('un tricount che non esiste non si mostra', () => {
    const deltas = diffExpenses(dataset([]), dataset([expense({ id: 'x', tricount: 'sparito' })]))
    expect(visibleDeltas(deltas, tricounts, 'me')).toEqual([])
  })
})

describe('cosa si è mosso in una modifica', () => {
  it('nomina i campi cambiati', () => {
    const delta = diffExpenses(
      dataset([expense({ id: 'a', amount: 10, title: 'Vecchio' })]),
      dataset([expense({ id: 'a', amount: 12, title: 'Nuovo' })]),
    )[0]!
    expect(changedFields(delta).sort()).toEqual(['descrizione', 'importo'])
  })

  it('su un’aggiunta non nomina niente', () => {
    const delta = diffExpenses(dataset([]), dataset([expense()]))[0]!
    expect(changedFields(delta)).toEqual([])
  })

  /*
   * L'unico punto del modulo che può restare indietro rispetto al tipo: se
   * `Expense` prende un campo nuovo e nessuno gli dà un'etichetta, una modifica
   * a quel campo direbbe «modificata» senza dire cosa. Il tipo di `FIELD_LABELS`
   * lo impedisce a compilazione; questo test lo dice anche a chi legge.
   */
  it('FIELD_LABELS li copre tutti tranne l’id', () => {
    const campi = Object.keys(expense({ notes: 'x', subcategory: 'y', welfare: true, tax730: true }))
    for (const campo of campi) {
      if (campo === 'id') continue
      expect(Object.keys(FIELD_LABELS), `manca l’etichetta di ${campo}`).toContain(campo)
    }
  })
})
