import { describe, expect, it } from 'vitest'

import {
  allFor,
  applyFilter,
  averageMonthly,
  catStats,
  categoryBreakdown,
  comparePeriods,
  EMPTY_FILTER,
  fillMonthGaps,
  monthlySeries,
  projectMonth,
  tax730ByYear,
  tax730Suggestions,
  tripStats,
  visibleFor,
} from './selectors'
import type { Expense, Trip } from './types'

function expense(partial: Partial<Expense> & { id: string; date: string; amount: number }): Expense {
  const half = Math.round((partial.amount * 100) / 2) / 100
  return {
    title: 'Voce',
    shares: { me: half, partner: partial.amount - half },
    paidBy: 'me',
    source: 'condivise',
    category: 'spesa',
    recurring: false,
    ...partial,
  }
}

const DATA: Expense[] = [
  expense({ id: 'a', date: '2026-06-03', amount: 100, recurring: true, category: 'casa' }),
  expense({ id: 'b', date: '2026-06-15', amount: 50, category: 'spesa' }),
  // agosto salta luglio: il mese vuoto deve pesare nella media
  expense({ id: 'c', date: '2026-08-04', amount: 60, category: 'spesa' }),
  expense({
    id: 'd',
    date: '2026-08-10',
    amount: 40,
    source: 'vacanze',
    trip: 'viaggio',
    category: 'viaggi',
  }),
  expense({
    id: 'e',
    date: '2026-08-12',
    amount: 200,
    source: 'personali',
    category: 'salute',
    shares: { me: 200, partner: 0 },
    tax730: true,
    receiptLinks: ['https://drive.google.com/file/d/x/view'],
  }),
]

describe('filtro di vista', () => {
  it('tiene fuori le vacanze per impostazione predefinita', () => {
    const visible = visibleFor(DATA, { person: 'me', includeVacations: false })
    expect(visible.map((e) => e.id)).toEqual(['a', 'b', 'c', 'e'])
  })

  it('le include quando richiesto', () => {
    const visible = visibleFor(DATA, { person: 'me', includeVacations: true })
    expect(visible.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('esclude le spese in cui la persona non ha quota', () => {
    const visible = visibleFor(DATA, { person: 'partner', includeVacations: true })
    expect(visible.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  describe('welfare', () => {
    /* Ristorante da 200 €, anticipato da lui col welfare, diviso a metà. */
    const cena = expense({
      id: 'welfare',
      date: '2026-06-20',
      amount: 200,
      paidBy: 'me',
      welfare: true,
    })

    it('non erode il budget di chi l’ha pagata col welfare', () => {
      const visible = visibleFor([...DATA, cena], { person: 'me', includeVacations: false })
      expect(visible.map((e) => e.id)).not.toContain('welfare')
    })

    it('resta una spesa normale per l’altra persona, che la rimborsa in contanti', () => {
      const visible = visibleFor([...DATA, cena], { person: 'partner', includeVacations: false })
      expect(visible.map((e) => e.id)).toContain('welfare')
    })

    it('conta ancora nell’elenco completo, che non è un budget', () => {
      expect(allFor([...DATA, cena], 'me').map((e) => e.id)).toContain('welfare')
    })
  })
})

describe('serie mensile', () => {
  const visible = visibleFor(DATA, { person: 'me', includeVacations: false })
  const series = monthlySeries(visible, 'me')

  it('separa fisse e variabili', () => {
    expect(series[0]).toEqual({ month: '2026-06', total: 75, fixed: 50, variable: 25, count: 2 })
  })

  it('riempie i mesi mancanti con zero', () => {
    const filled = fillMonthGaps(series)
    expect(filled.map((row) => row.month)).toEqual(['2026-06', '2026-07', '2026-08'])
    expect(filled[1]?.total).toBe(0)
  })

  it('calcola la media contando anche i mesi vuoti, escluso quello in corso', () => {
    // giugno 75 + luglio 0, su due mesi (agosto escluso perché in corso)
    const average = averageMonthly(series, { excludeMonth: '2026-08' })
    expect(average.months).toBe(2)
    expect(average.perMonth).toBe(37.5)
  })
})

describe('proiezione di fine mese', () => {
  const month = { month: '2026-08', total: 500, fixed: 300, variable: 200, count: 10 }

  it('non proietta le fisse in modo lineare', () => {
    // 10 giorni su 31: le variabili triplicano, le fisse restano quelle
    const projection = projectMonth(month, '2026-08-10', 300)
    expect(projection.method).toBe('stimato')
    expect(projection.projected).toBe(920) // 300 + 200/10*31
  })

  it('usa la media storica se le fisse non sono ancora state addebitate', () => {
    const projection = projectMonth({ ...month, fixed: 0, variable: 200 }, '2026-08-10', 300)
    expect(projection.projected).toBe(920)
  })

  it('a mese chiuso restituisce il totale', () => {
    const projection = projectMonth(month, '2026-09-02', 300)
    expect(projection.method).toBe('chiuso')
    expect(projection.projected).toBe(500)
    expect(projection.projectedVariable).toBe(200)
    expect(projection.expectedFixed).toBe(300)
  })

  it('espone fisse e variabili attese, per confrontare la proiezione con la media', () => {
    const projection = projectMonth(month, '2026-08-10', 420)
    expect(projection.expectedFixed).toBe(420) // la media storica supera le fisse già addebitate
    expect(projection.projectedVariable).toBe(620) // 200 / 10 × 31
    expect(projection.projected).toBe(1040)
  })
})

describe('confronto fra periodi', () => {
  it('parte dal mese precedente a quello selezionato', () => {
    const series = monthlySeries(visibleFor(DATA, { person: 'me', includeVacations: false }), 'me')
    const comparison = comparePeriods(series, '2026-09', 3)
    expect(comparison.currentMonths).toEqual(['2026-06', '2026-07', '2026-08'])
    expect(comparison.previousMonths).toEqual(['2026-03', '2026-04', '2026-05'])
    // giugno 75 + luglio 0 + agosto 230 (30 di spesa + 200 di salute personale)
    expect(comparison.current).toBe(305)
    expect(comparison.deltaPct).toBeNull()
  })
})

describe('categorie', () => {
  it('ordina le fette e calcola le percentuali', () => {
    const visible = visibleFor(DATA, { person: 'me', includeVacations: false })
    const slices = categoryBreakdown(visible, 'me')
    expect(slices[0]?.key).toBe('salute')
    expect(slices[0]?.total).toBe(200)
    expect(slices.reduce((acc, s) => acc + s.pct, 0)).toBeCloseTo(1)
  })
})

describe('gatto', () => {
  const catData: Expense[] = [
    expense({ id: 'g1', date: '2026-06-10', amount: 40, category: 'gatto', subcategory: 'cibo' }),
    expense({ id: 'g2', date: '2026-07-10', amount: 90, category: 'gatto', subcategory: 'veterinario' }),
  ]

  it('somma la quota della persona e il totale della coppia', () => {
    const stats = catStats(catData, 'me', 'gatto')
    expect(stats.total).toBe(130)
    expect(stats.share).toBe(65)
    expect(stats.perPerson.partner).toBe(65)
    expect(stats.months).toBe(2)
    expect(stats.monthlyAvgShare).toBe(32.5)
    expect(stats.subcategories.map((s) => s.key)).toEqual(['veterinario', 'cibo'])
  })
})

describe('viaggi', () => {
  const trip: Trip = {
    id: 'viaggio',
    name: 'Prova',
    place: 'Lofoten',
    year: 2026,
    start: '2026-08-09',
    end: '2026-08-11',
  }

  it('calcola giorni inclusivi e costo al giorno', () => {
    const [stats] = tripStats(DATA, [trip], 'me')
    expect(stats?.days).toBe(3)
    expect(stats?.total).toBe(40)
    expect(stats?.share).toBe(20)
    expect(stats?.perDayShare).toBeCloseTo(6.67, 2)
  })

  it('tiene separati il conto del gruppo e quello della coppia', () => {
    /* Una cena da 216 € in sei: 36,01 tuoi, 36,02 di lei, il resto di altri. */
    const gruppo = expense({
      id: 'gruppo',
      date: '2026-08-10',
      amount: 216.1,
      source: 'vacanze',
      trip: 'viaggio',
      category: 'viaggi',
      subcategory: 'cibo',
      paidBy: 'others',
      shares: { me: 36.01, partner: 36.02, others: 144.07 },
    })
    const [stats] = tripStats([...DATA, gruppo], [trip], 'me')
    expect(stats?.total).toBe(256.1)
    expect(stats?.couple).toBe(112.03)
    expect(stats?.others).toBe(144.07)
    expect(stats?.share).toBe(56.01)
    /* La coppia non paga la quota degli altri: al giorno conta solo la sua parte. */
    expect(stats?.perDayCouple).toBeCloseTo(37.34, 2)
  })

  it('conta come welfare solo la quota di chi ha anticipato', () => {
    /*
     * Ristorante da 200 € pagato col welfare da lui: 100 € sono suoi e non escono
     * da nessuna tasca, gli altri 100 € Federica glieli rimborsa in contanti.
     */
    const stellato = expense({
      id: 'stellato',
      date: '2026-08-10',
      amount: 200,
      source: 'vacanze',
      trip: 'viaggio',
      category: 'viaggi',
      subcategory: 'cibo',
      paidBy: 'me',
      welfare: true,
    })
    const [stats] = tripStats([...DATA, stellato], [trip], 'me')
    expect(stats?.couple).toBe(240)
    expect(stats?.welfare).toBe(100)
  })

  it('spezza il viaggio per sottocategoria, non per categoria', () => {
    const alloggio = expense({
      id: 'hotel',
      date: '2026-08-09',
      amount: 100,
      source: 'vacanze',
      trip: 'viaggio',
      category: 'viaggi',
      subcategory: 'alloggio',
    })
    const [stats] = tripStats([...DATA, alloggio], [trip], 'me')
    expect(stats?.parts.map((p) => p.key).sort()).toEqual(['alloggio', 'viaggi'])
  })
})

describe('730', () => {
  it('raggruppa per anno e conta gli scontrini', () => {
    const years = tax730ByYear(DATA, 'me')
    expect(years).toHaveLength(1)
    expect(years[0]?.year).toBe(2026)
    expect(years[0]?.share).toBe(200)
    expect(years[0]?.withReceipt).toBe(1)
    expect(years[0]?.missingReceipt).toBe(0)
  })

  it('non mostra a una persona le spese in cui non ha quota', () => {
    expect(tax730ByYear(DATA, 'partner')).toHaveLength(0)
  })

  it('suggerisce per sottocategoria, così la lettiera non finisce nel 730', () => {
    const data = [
      expense({ id: 'vet', date: '2026-05-04', amount: 300, category: 'gatto', subcategory: 'veterinario' }),
      expense({ id: 'sabbia', date: '2026-05-05', amount: 9, category: 'gatto', subcategory: 'lettiera' }),
      expense({ id: 'f24', date: '2026-05-06', amount: 70, category: 'burocrazia' }),
    ]
    const hints = ['gatto/veterinario', 'burocrazia']
    expect(tax730Suggestions(data, 'me', hints, 2026).map((e) => e.id).sort()).toEqual(['f24', 'vet'])
  })
})

describe('filtri', () => {
  it('cerca nel titolo e nelle note', () => {
    const data = [expense({ id: 'x', date: '2026-06-01', amount: 10, title: 'Crocchette gatto' })]
    expect(applyFilter(data, { ...EMPTY_FILTER, query: 'crocc' })).toHaveLength(1)
    expect(applyFilter(data, { ...EMPTY_FILTER, query: 'benzina' })).toHaveLength(0)
  })

  it('combina più filtri', () => {
    const filtered = applyFilter(DATA, { ...EMPTY_FILTER, month: '2026-08', tax730Only: true })
    expect(filtered.map((e) => e.id)).toEqual(['e'])
  })
})
