import { describe, expect, it } from 'vitest'

import {
  EMPTY_FILTER,
  allFor,
  applyFilter,
  averageMonthly,
  balanceDeltaOf,
  catStats,
  categoryBreakdown,
  compareSameDays,
  comparePeriods,
  coupleBalance,
  extremeMonths,
  fillMonthGaps,
  fixedShareSeries,
  houseLedger,
  houseOutside,
  monthlySeries,
  owedOf,
  projectMonth,
  recurringProfile,
  subsetStats,
  tax730ByYear,
  tax730Suggestions,
  tripStats,
  visibleFor,
  yearlyTotals,
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
      amount: 180,
      source: 'vacanze',
      trip: 'viaggio',
      category: 'viaggi',
      subcategory: 'cibo',
      paidBy: 'others',
      shares: { me: 30, partner: 30, others: 120 },
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

describe('la casa: due insiemi che non coincidono', () => {
  const CASA: Expense[] = [
    // dentro il tricount di casa
    expense({ id: 'h1', date: '2026-06-01', amount: 800, source: 'fisse', category: 'casa', subcategory: 'affitto', recurring: true }),
    expense({ id: 'h2', date: '2026-06-05', amount: 120, source: 'fisse', category: 'casa', subcategory: 'bollette', recurring: true }),
    // nel tricount di casa ma casa non è: è il caso vero della telefonia
    expense({ id: 'h3', date: '2026-06-07', amount: 30, source: 'fisse', category: 'telefonia', recurring: true }),
    // casa, ma registrata nell'altro tricount condiviso
    expense({ id: 'h4', date: '2026-06-11', amount: 40, source: 'condivise', category: 'casa', subcategory: 'prodotti' }),
    // né l'uno né l'altro
    expense({ id: 'h5', date: '2026-06-12', amount: 25, source: 'condivise', category: 'spesa' }),
  ]

  it('il tricount comprende anche ciò che casa non è', () => {
    const ledger = houseLedger(CASA, 'fisse')
    expect(ledger.map((e) => e.id)).toEqual(['h1', 'h2', 'h3'])
  })

  it('le spese di casa fuori dal tricount non finiscono contate due volte', () => {
    const outside = houseOutside(CASA, 'fisse', 'casa')
    expect(outside.map((e) => e.id)).toEqual(['h4'])
    // h1 e h2 sono casa, ma stanno nel tricount: qui non ci devono essere
    const ledger = houseLedger(CASA, 'fisse')
    const doppie = outside.filter((e) => ledger.some((l) => l.id === e.id))
    expect(doppie).toEqual([])
  })

  it('somma le quote del sottoinsieme, non gli importi interi', () => {
    const stats = subsetStats(houseLedger(CASA, 'fisse'), 'me')
    // metà di 800 + 120 + 30
    expect(stats.share).toBe(475)
    expect(stats.total).toBe(950)
    expect(stats.count).toBe(3)
  })
})

describe('il saldo fra le due persone', () => {
  const OPTS = { since: '2026-08-01', opening: 0 }

  const SPESE: Expense[] = [
    // prima del punto di partenza: sta già dentro `opening`, non si conta
    expense({ id: 's0', date: '2026-07-20', amount: 100, paidBy: 'me' }),
    // ho anticipato io: lei mi deve la sua metà
    expense({ id: 's1', date: '2026-08-05', amount: 100, paidBy: 'me' }),
    // ha anticipato lei: le devo la mia metà
    expense({ id: 's2', date: '2026-08-06', amount: 40, paidBy: 'partner' }),
    // tutta mia, pagata da me: nessun debito
    expense({ id: 's3', date: '2026-08-07', amount: 30, paidBy: 'me', shares: { me: 30, partner: 0 } }),
  ]

  it('conta solo ciò che è dopo il punto di partenza', () => {
    const saldo = coupleBalance(SPESE, [], OPTS)
    // 50 che mi deve − 20 che le devo
    expect(saldo.balance).toBe(30)
    expect(saldo.frontedByMe).toBe(50)
    expect(saldo.frontedByPartner).toBe(20)
    expect(saldo.movements.map((m) => m.id)).toEqual(['s2', 's1'])
  })

  it('parte dal saldo dichiarato invece che dall’inizio dei tempi', () => {
    expect(coupleBalance(SPESE, [], { ...OPTS, opening: 240 }).balance).toBe(270)
  })

  it('un rimborso avvicina il saldo a zero', () => {
    const rimborso = { id: 'r1', date: '2026-08-10', from: 'partner' as const, to: 'me' as const, amount: 30 }
    const saldo = coupleBalance(SPESE, [rimborso], OPTS)
    expect(saldo.balance).toBe(0)
    expect(saldo.settled).toBe(30)
  })

  it('NON esclude il welfare: la quota dell’altra persona è debito comunque', () => {
    /* Il welfare toglie la spesa dal budget di chi l'ha anticipata, ma la metà
       dell'altra rientra in contanti: filtrarla qui perderebbe il debito. */
    const conWelfare: Expense[] = [
      expense({ id: 'w1', date: '2026-08-08', amount: 502, paidBy: 'me', welfare: true }),
    ]
    expect(coupleBalance(conWelfare, [], OPTS).balance).toBe(251)
  })

  it('tiene fuori dal saldo di coppia quello che ha anticipato un terzo', () => {
    const conTerzi: Expense[] = [
      expense({
        id: 't1',
        date: '2026-08-09',
        amount: 90,
        paidBy: 'others',
        source: 'vacanze',
        trip: 'x',
        shares: { me: 30, partner: 30, others: 30 },
      }),
    ]
    const saldo = coupleBalance(conTerzi, [], OPTS)
    expect(saldo.balance).toBe(0)
    expect(saldo.outsideCouple).toBe(60)
    expect(saldo.movements).toEqual([])
  })

  it('il segno è fisso: positivo vuol dire che il partner deve a me', () => {
    const soloLei: Expense[] = [expense({ id: 'x1', date: '2026-08-11', amount: 20, paidBy: 'partner' })]
    expect(coupleBalance(soloLei, [], OPTS).balance).toBe(-10)
  })
})

describe('il saldo tricount per tricount', () => {
  /*
   * Le stesse spese, in tricount diversi. È il caso che ha fatto nascere la
   * separazione: un numero solo per tutta la coppia non si confronta con niente
   * di quello che si vede su Tricount, che tiene un saldo per gruppo. → ADR-0022
   */
  const SPESE: Expense[] = [
    expense({ id: 'f1', date: '2026-08-05', amount: 30, paidBy: 'me', source: 'fisse' }),
    expense({ id: 'c1', date: '2026-08-06', amount: 50, paidBy: 'partner', source: 'condivise' }),
    expense({
      id: 'v1',
      date: '2026-08-07',
      amount: 100,
      paidBy: 'me',
      source: 'vacanze',
      trip: 'creta-2025',
    }),
  ]

  it('separa i tricount, e le vacanze una per viaggio', () => {
    const saldo = coupleBalance(SPESE, [], { since: '2026-08-01', opening: 0 })
    expect(saldo.groups.map((g) => g.key).sort()).toEqual([
      'condivise',
      'fisse',
      'vacanze/creta-2025',
    ])
    const per = (key: string) => saldo.groups.find((g) => g.key === key)
    expect(per('fisse')?.balance).toBe(15)
    expect(per('condivise')?.balance).toBe(-25)
    expect(per('vacanze/creta-2025')?.balance).toBe(50)
    /* Il totale resta la somma: separare non deve cambiare quanto vi dovete. */
    expect(saldo.balance).toBe(40)
  })

  it('ogni tricount ha il suo punto di partenza e la sua data', () => {
    const saldo = coupleBalance(SPESE, [], {
      since: '2026-08-01',
      opening: 0,
      groups: {
        /* Dichiarato dopo la spesa: quella sta già dentro il numero di partenza. */
        fisse: { since: '2026-08-31', opening: 16.93 },
        condivise: { since: '2026-08-01', opening: 0 },
      },
    })
    const per = (key: string) => saldo.groups.find((g) => g.key === key)
    expect(per('fisse')?.balance).toBe(16.93)
    expect(per('fisse')?.movements).toBe(0)
    expect(per('condivise')?.balance).toBe(-25)
    /* Non dichiarato: il suo numero non è confrontabile con Tricount. */
    expect(per('vacanze/creta-2025')?.declared).toBe(false)
    expect(saldo.undeclared).toEqual(['vacanze/creta-2025'])
    expect(saldo.balance).toBe(16.93 - 25 + 50)
  })

  it('il residuo generale entra una volta sola, non una per tricount', () => {
    /*
     * La trappola di questo modello: se ogni gruppo eredita l'`opening`
     * generale, tre tricount lo contano tre volte e il saldo triplica in
     * silenzio. `opening` è un residuo del rapporto, non il valore di partenza
     * dei gruppi.
     */
    const saldo = coupleBalance(SPESE, [], { since: '2026-08-01', opening: 100 })
    expect(saldo.groups).toHaveLength(3)
    expect(saldo.balance).toBe(140)
    for (const group of saldo.groups) expect(group.opening).toBe(0)
  })

  it('un tricount dichiarato esiste anche se non si è mosso: «in pari» è un fatto', () => {
    const saldo = coupleBalance([], [], {
      since: '2026-08-01',
      opening: 0,
      groups: { 'vacanze/sud-italia-2026': { since: '2026-08-20', opening: 0 } },
    })
    expect(saldo.groups.map((g) => g.key)).toEqual(['vacanze/sud-italia-2026'])
    expect(saldo.groups[0]?.declared).toBe(true)
    expect(saldo.undeclared).toEqual([])
  })

  it('un tricount con una storia ma senza punto di partenza compare, marcato', () => {
    /*
     * Il difetto da cui nasce questo test: le quattro vacanze vecchie non hanno
     * movimenti recenti, e venivano omesse del tutto — cinquecento euro spariti
     * in silenzio da un totale che sembrava completo.
     */
    const vecchia: Expense[] = [
      expense({
        id: 'g1',
        date: '2024-10-27',
        amount: 200,
        paidBy: 'me',
        source: 'vacanze',
        trip: 'germania-2024',
      }),
    ]
    const saldo = coupleBalance(vecchia, [], { since: '2026-08-16', opening: 0 })
    expect(saldo.groups.map((g) => g.key)).toEqual(['vacanze/germania-2024'])
    expect(saldo.groups[0]?.declared).toBe(false)
    expect(saldo.groups[0]?.movements).toBe(0)
    expect(saldo.undeclared).toEqual(['vacanze/germania-2024'])
  })

  it('le spese personali non fanno una riga: non hanno mai una quota dell’altro', () => {
    const personali: Expense[] = [
      expense({
        id: 'p1',
        date: '2026-08-05',
        amount: 20,
        paidBy: 'me',
        source: 'personali',
        shares: { me: 20, partner: 0 },
      }),
    ]
    expect(coupleBalance(personali, [], { since: '2026-08-01', opening: 0 }).groups).toEqual([])
  })

  it('ogni movimento sa da quale tricount viene', () => {
    const saldo = coupleBalance(SPESE, [], { since: '2026-08-01', opening: 0 })
    expect(saldo.movements.map((m) => m.group)).toEqual([
      'vacanze/creta-2025',
      'condivise',
      'fisse',
    ])
  })
})

describe('quanto sposta il saldo una spesa', () => {
  it('se hai pagato tu, il partner ti deve la sua quota', () => {
    const mia = expense({ id: 'm', date: '2026-08-10', amount: 50, paidBy: 'me' })
    expect(balanceDeltaOf(mia)).toBe(25)
  })

  it('se ha pagato lei, il segno si gira', () => {
    const sua = expense({ id: 's', date: '2026-08-10', amount: 50, paidBy: 'partner' })
    expect(balanceDeltaOf(sua)).toBe(-25)
  })

  it('un conto anticipato da qualcun altro non è un debito fra voi', () => {
    const altrui = expense({
      id: 'o',
      date: '2026-08-10',
      amount: 60,
      paidBy: 'others',
      source: 'vacanze',
      trip: 'creta-2025',
      shares: { me: 20, partner: 20, others: 20 },
    })
    expect(balanceDeltaOf(altrui)).toBe(0)
    expect(owedOf(altrui)).toBe(0)
  })

  /*
   * È il numero che il foglio annuncia prima di spostare una spesa di tricount:
   * quello che esce da un gruppo entra nell'altro, e il totale non si muove.
   */
  it('spostare una spesa muove quel numero da un gruppo all’altro, e il totale resta', () => {
    const spesa = expense({ id: 'x', date: '2026-08-10', amount: 50, paidBy: 'me' })
    const opts = { since: '2026-08-01', opening: 0 }
    const prima = coupleBalance([spesa], [], opts)
    const dopo = coupleBalance([{ ...spesa, source: 'fisse' }], [], opts)

    expect(prima.groups.map((g) => g.key)).toEqual(['condivise'])
    expect(dopo.groups.map((g) => g.key)).toEqual(['fisse'])
    expect(prima.groups[0]?.balance).toBe(balanceDeltaOf(spesa))
    expect(dopo.balance).toBe(prima.balance)
  })
})

describe('portare una spesa in «Personale»', () => {
  /*
   * Il difetto che questo presidia: spostando in «Personale» una spesa
   * anticipata dall'altra persona, e riscrivendo `paidBy` su chi guarda, il
   * debito si azzerava. Una cena da 50 € pagata da lei e dichiarata «tutta mia»
   * significa che gliene devo 50, non zero — e nessun rimborso è avvenuto.
   */
  const pagataDaLei = expense({
    id: 'pl',
    date: '2026-08-10',
    amount: 50,
    paidBy: 'partner',
    shares: { me: 25, partner: 25 },
  })

  it('il debito cresce fino a tutto l’importo, e non si azzera', () => {
    expect(balanceDeltaOf(pagataDaLei)).toBe(-25)

    /* Come la porta il pannello: quote tutte mie, pagante intatto. */
    const mia = { ...pagataDaLei, source: 'personali' as const, shares: { me: 50, partner: 0 } }
    expect(balanceDeltaOf(mia)).toBe(-50)

    /* Come la portava prima, riscrivendo il pagante: il debito svaniva. */
    const sbagliata = { ...mia, paidBy: 'me' as const }
    expect(balanceDeltaOf(sbagliata)).toBe(0)
  })

  it('e il saldo la conta, anche se è un tricount personale', () => {
    const mia = { ...pagataDaLei, source: 'personali' as const, shares: { me: 50, partner: 0 } }
    const saldo = coupleBalance([mia], [], { since: '2026-08-01', opening: 0 })
    expect(saldo.balance).toBe(-50)
    expect(saldo.groups.map((g) => g.key)).toEqual(['personali'])
  })
})

describe('confronto col mese scorso a pari giorni', () => {
  /*
   * Il difetto che questo presidia: confrontare un mese a metà con un mese
   * intero. Luglio chiude a 300, agosto è al 15 con 100: il paragone giusto è
   * con i primi 15 giorni di luglio (50), non con tutto luglio.
   */
  const storia: Expense[] = [
    expense({ id: 'l1', date: '2026-07-05', amount: 100, shares: { me: 50, partner: 50 } }),
    expense({ id: 'l2', date: '2026-07-25', amount: 500, shares: { me: 250, partner: 250 } }),
    expense({ id: 'a1', date: '2026-08-10', amount: 200, shares: { me: 100, partner: 100 } }),
  ]

  it('taglia anche il mese scorso ai giorni trascorsi', () => {
    const r = compareSameDays(storia, 'me', '2026-08', '2026-08-15')
    expect(r.days).toBe(15)
    expect(r.current).toBe(100)
    expect(r.previous).toBe(50)
    expect(r.deltaPct).toBe(1)
    expect(r.wholePrevious).toBe(false)
  })

  it('a mese chiuso confronta due mesi interi, senza dover cambiare metodo', () => {
    const r = compareSameDays(storia, 'me', '2026-08', '2026-09-04')
    expect(r.days).toBe(31)
    expect(r.current).toBe(100)
    expect(r.previous).toBe(300)
    expect(r.wholePrevious).toBe(true)
  })

  it('trentuno giorni contro un mese da trenta sono il mese intero, e lo dichiara', () => {
    const r = compareSameDays(storia, 'me', '2026-08', '2026-08-31')
    expect(r.days).toBe(31)
    expect(r.previous).toBe(300)
    expect(r.wholePrevious).toBe(true)
  })

  it('senza mese precedente lo scostamento relativo non esiste', () => {
    const r = compareSameDays(storia, 'me', '2026-07', '2026-07-10')
    expect(r.previous).toBe(0)
    expect(r.deltaPct).toBeNull()
    expect(r.previousMonth).toBe('2026-06')
  })
})

describe('statistiche di lungo periodo', () => {
  const serie = monthlySeries(visibleFor(DATA, { person: 'me', includeVacations: false }), 'me')

  it('l’anno per anno conta i mesi osservati, non dodici', () => {
    const anni = yearlyTotals(serie)
    expect(anni.map((a) => a.year)).toEqual([2026])
    const y = anni[0]!
    expect(y.months).toBe(2)
    /* 75 (giugno) + 30 + 200 (agosto) = 305, e la media è sui due mesi visti. */
    expect(y.total).toBe(305)
    expect(y.perMonth).toBe(152.5)
  })

  it('il mese più leggero non è il mese in corso, che è parziale', () => {
    const senza = extremeMonths(serie)
    expect(senza.lowest?.month).toBe('2026-06')
    const con = extremeMonths(serie, { excludeMonth: '2026-06' })
    expect(con.lowest?.month).toBe('2026-08')
    expect(con.highest?.month).toBe('2026-08')
  })

  it('un mese senza spese non ha una quota di fisse', () => {
    const quota = fixedShareSeries(fillMonthGaps(serie))
    /* Luglio è vuoto: tre mesi nella serie riempita, due punti qui. */
    expect(fillMonthGaps(serie)).toHaveLength(3)
    expect(quota.points.map((p) => p.month)).toEqual(['2026-06', '2026-08'])
    expect(quota.highest?.month).toBe('2026-06')
    expect(quota.lowest?.month).toBe('2026-08')
  })

  it('e il mese in corso resta fuori: a inizio mese sarebbe quasi tutto fisse', () => {
    const quota = fixedShareSeries(serie, { excludeMonth: '2026-08' })
    expect(quota.points.map((p) => p.month)).toEqual(['2026-06'])
    expect(quota.highest?.month).toBe('2026-06')
  })

  it('le fisse ricorrenti si raggruppano per titolo, e i mesi dicono se il gruppo è giusto', () => {
    const affitti: Expense[] = [
      expense({ id: 'r1', date: '2026-06-03', amount: 950, recurring: true, title: 'Affitto' }),
      expense({ id: 'r2', date: '2026-07-03', amount: 950, recurring: true, title: ' affitto ' }),
      expense({ id: 'r3', date: '2026-07-04', amount: 30, recurring: true, title: 'Netflix' }),
      expense({ id: 'r4', date: '2026-07-06', amount: 80, title: 'Cena' }),
    ]
    const { rows, monthlyBase } = recurringProfile(affitti, 'me')
    /* Raggruppa ignorando maiuscole e spazi, ma mostra il titolo dell'ultima
       occorrenza — qui « affitto », scritto male di proposito. */
    expect(rows.map((r) => r.title)).toEqual(['affitto', 'Netflix'])
    expect(rows[0]?.months).toBe(2)
    expect(rows[0]?.perMonth).toBe(475)
    /* Netflix una volta sola: il mese solitario è la spia, non un errore. */
    expect(rows[1]?.months).toBe(1)
    expect(rows[1]?.perMonth).toBe(15)
    expect(monthlyBase).toBe(490)
  })
})
