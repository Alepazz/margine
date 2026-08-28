import { describe, expect, it } from 'vitest'

import { computeMargin, incomeBreakdown, marginBar, marginStatus, marginView } from './income'
import { toCents } from './money'
import type { MonthTotal, Projection } from './selectors'
import type { IncomeProfile } from './types'

const PROFILE: IncomeProfile = {
  configured: true,
  netMonthly: 2200,
  extraMonths: 1,
  annualBonusNet: 1500,
  mealVouchers: { valuePerDay: 8, daysPerMonth: 20 },
  otherMonthlyNet: 0,
  monthlySavingsTarget: 300,
}

describe('entrate mensili', () => {
  it('spalma tredicesima e bonus su dodici mesi', () => {
    const breakdown = incomeBreakdown(PROFILE)
    expect(breakdown.stipendio).toBe(2200)
    expect(breakdown.buoniPasto).toBe(160)
    expect(breakdown.differite).toBe(308.33) // (2200 + 1500) / 12
    expect(breakdown.totale).toBe(2668.33)
  })
})

describe('semaforo del mese', () => {
  it('è verde quando la proiezione lascia spazio anche al risparmio', () => {
    expect(marginStatus(2000, 1200, 300)).toBe('ok')
  })

  it('avvisa quando la proiezione mangia l’obiettivo di risparmio', () => {
    expect(marginStatus(2000, 1750, 300)).toBe('attenzione')
  })

  it('avvisa oltre il 90% delle entrate anche senza obiettivo', () => {
    expect(marginStatus(2000, 1850, 0)).toBe('attenzione')
  })

  it('è rosso quando la proiezione supera le entrate', () => {
    expect(marginStatus(2000, 2050, 0)).toBe('oltre')
  })
})

describe('margine', () => {
  const month: MonthTotal = { month: '2026-08', total: 1200, fixed: 600, variable: 600, count: 20 }
  const projection: Projection = {
    projected: 1600,
    method: 'stimato',
    elapsedDays: 20,
    totalDays: 31,
    projectedVariable: 930,
    expectedFixed: 670,
  }

  it('mette insieme speso, proiezione e obiettivo di risparmio', () => {
    const result = computeMargin(month, projection, PROFILE)
    expect(result.known).toBe(true)
    expect(result.margin).toBe(1468.33)
    expect(result.projectedMargin).toBe(1068.33)
    expect(result.marginAfterSavings).toBe(1168.33)
    expect(result.status).toBe('ok')
  })

  it('dichiara di non sapere quando il profilo entrate non è compilato', () => {
    const result = computeMargin(month, projection, { ...PROFILE, configured: false })
    expect(result.known).toBe(false)
    expect(result.status).toBe('sconosciuto')
  })
})

describe('quanto puoi ancora spendere', () => {
  const month: MonthTotal = { month: '2026-08', total: 1200, fixed: 600, variable: 600, count: 20 }
  const aperto: Projection = {
    projected: 1600,
    method: 'stimato',
    elapsedDays: 20,
    totalDays: 31,
    projectedVariable: 930,
    expectedFixed: 670,
  }

  it('toglie risparmio, fisse attese e variabili già spese', () => {
    const result = computeMargin(month, aperto, PROFILE)
    // 2668,33 − 300 di risparmio − 670 di fisse attese = 1698,33 di fondo discrezionale
    expect(result.discretionaryBudget).toBe(1698.33)
    // meno 600 di variabili già spese
    expect(result.spendable).toBe(1098.33)
    expect(result.expectedFixed).toBe(670)
    expect(result.spendablePerDay).toBe(99.85) // su 11 giorni rimasti
  })

  it('conta le fisse che devono ancora arrivare, anche se non si vedono sul conto', () => {
    const result = computeMargin(month, aperto, PROFILE)
    expect(result.fixedStillDue).toBe(70) // 670 attese − 600 già addebitate
    // È la differenza con «quanto c'è in cassa», che le ignora.
    expect(result.margin - result.savingsTarget - result.spendable).toBe(70)
  })

  it('a mese chiuso coincide col margine al netto del risparmio: la storia non si muove', () => {
    const chiuso: Projection = {
      projected: 1200,
      method: 'chiuso',
      elapsedDays: 31,
      totalDays: 31,
      projectedVariable: 600,
      expectedFixed: 600,
    }
    const result = computeMargin(month, chiuso, PROFILE)
    expect(result.spendable).toBe(result.marginAfterSavings)
    expect(result.fixedStillDue).toBe(0)
  })

  it('va sotto zero quando fisse e risparmio hanno già mangiato tutto', () => {
    const speso: MonthTotal = { month: '2026-08', total: 2500, fixed: 900, variable: 1600, count: 60 }
    const chiuso: Projection = {
      projected: 2500,
      method: 'chiuso',
      elapsedDays: 31,
      totalDays: 31,
      projectedVariable: 1600,
      expectedFixed: 900,
    }
    const result = computeMargin(speso, chiuso, PROFILE)
    expect(result.spendable).toBe(-131.67)
    // Il semaforo non può dire «ok» con lo spendibile negativo: se le fisse e il
    // risparmio hanno già superato le entrate, la proiezione ha per forza
    // superato «entrate − risparmio», che è la soglia dell'avviso.
    expect(result.status).not.toBe('ok')
    // Al giorno non si scende sotto zero: «puoi spendere −12 € al giorno» non vuol dire niente.
    expect(result.spendablePerDay).toBe(0)
  })
})

describe('oscurare i guadagni', () => {
  const month: MonthTotal = { month: '2026-08', total: 1200, fixed: 600, variable: 600, count: 20 }
  const projection: Projection = {
    projected: 1600,
    method: 'stimato',
    elapsedDays: 20,
    totalDays: 31,
    projectedVariable: 930,
    expectedFixed: 670,
  }
  const result = computeMargin(month, projection, PROFILE)

  /*
   * Questa lista è scritta a mano di proposito, invece di importare
   * PUBLIC_MARGIN_FIELDS: se qualcuno allarga ciò che resta visibile, il test
   * deve cadere e costringere a una decisione, non seguirlo in silenzio.
   */
  const VISIBILI = [
    'known',
    'status',
    'spent',
    'projectedSpent',
    'expectedFixed',
    'variableSpent',
    'fixedSpent',
    'fixedStillDue',
    /* Da ADR-0066: il velo copre quanto guadagni, non quanto puoi spendere. */
    'savingsTarget',
    'spendable',
    'spendablePerDay',
  ]

  it('lascia in chiaro le spese e ciò che resta da spendere', () => {
    const view = marginView(result, { hideIncome: true })
    for (const key of VISIBILI) {
      expect(view[key as keyof typeof view]).toBe(result[key as keyof typeof result])
    }
  })

  it('azzera ogni altro campo, a partire dai guadagni nudi', () => {
    const view = marginView(result, { hideIncome: true })
    const azzerati = Object.keys(result).filter((key) => !VISIBILI.includes(key))
    // Se questo elenco si svuota, il test non sta più presidiando niente.
    expect(azzerati.length).toBeGreaterThan(5)
    for (const key of azzerati) {
      expect(view[key as keyof typeof view]).toBeNull()
    }
  })

  it('copre i guadagni e tutto ciò che è «entrate meno qualcosa»', () => {
    /* Nominati uno per uno, e non per differenza: questi non chiedono una somma
       a chi guarda, basta leggerli. → ADR-0066 */
    const view = marginView(result, { hideIncome: true })
    for (const key of [
      'income',
      'breakdown',
      'margin',
      'marginAfterSavings',
      'projectedMargin',
      'projectedMarginAfterSavings',
      'discretionaryBudget',
      'usedPct',
    ] as const) {
      expect(view[key]).toBeNull()
    }
  })

  it('lo spendibile resta leggibile: è la risposta dell’app, non un guadagno', () => {
    /* Il difetto che ha fatto nascere ADR-0066: coperto anche questo, l'app
       mostrata a un amico non diceva più niente, e l'oscuramento restava
       spento. */
    const view = marginView(result, { hideIncome: true })
    expect(view.spendable).toBe(result.spendable)
    expect(view.savingsTarget).toBe(result.savingsTarget)
  })

  it('non tocca niente quando i guadagni sono in chiaro', () => {
    expect(marginView(result, { hideIncome: false })).toEqual(result)
  })
})

/*
 * ─────────────────────────────────────────────────────────────────────────
 * Il difetto che ha fatto nascere la barra a segmenti, scritto come test.
 *
 * Il 27/08/2026 Alessio ha registrato l'affitto e si è trovato oltre il mese,
 * senza aspettarselo: «mi sarei aspettato che quella spesa fosse già contata in
 * precedenza». Lo era — `expectedFixed` la scontava dal primo giorno del mese —
 * ma **solo se la spesa porta la spunta «ricorrente»**. Senza, l'affitto entra
 * fra le variabili *in aggiunta* alla media delle fisse già sottratta, e lo si
 * paga due volte. Questi due test sono le due strade, una accanto all'altra.
 * ─────────────────────────────────────────────────────────────────────────
 */
describe('una spesa fissa che arriva', () => {
  const AFFITTO = 444
  const chiusura = (mese: MonthTotal, fisseAttese: number): Projection => ({
    projected: fisseAttese + mese.variable,
    method: 'stimato',
    elapsedDays: 27,
    totalDays: 31,
    projectedVariable: mese.variable,
    expectedFixed: fisseAttese,
  })

  it('non muove lo spendibile, se ha la spunta di ricorrente', () => {
    const prima: MonthTotal = { month: '2026-08', total: 1100, fixed: 17, variable: 1083, count: 30 }
    const dopo: MonthTotal = {
      month: '2026-08',
      total: 1100 + AFFITTO,
      fixed: 17 + AFFITTO,
      variable: 1083,
      count: 31,
    }
    /* Le fisse attese non cambiano: la media le prevedeva già. */
    const attese = 470
    expect(computeMargin(dopo, chiusura(dopo, attese), PROFILE).spendable).toBe(
      computeMargin(prima, chiusura(prima, attese), PROFILE).spendable,
    )
  })

  it('lo abbatte di tutto il suo importo, se la spunta manca', () => {
    const prima: MonthTotal = { month: '2026-08', total: 1100, fixed: 17, variable: 1083, count: 30 }
    const senzaSpunta: MonthTotal = {
      month: '2026-08',
      total: 1100 + AFFITTO,
      fixed: 17,
      variable: 1083 + AFFITTO,
      count: 31,
    }
    const attese = 470
    /* In centesimi: la sottrazione fra due euro in virgola mobile darebbe
       444,00000000000006, che è il difetto contro cui esiste `money.ts`. */
    const perso =
      toCents(computeMargin(prima, chiusura(prima, attese), PROFILE).spendable) -
      toCents(computeMargin(senzaSpunta, chiusura(senzaSpunta, attese), PROFILE).spendable)
    expect(perso).toBe(toCents(AFFITTO))
  })
})

describe('la barra del mese intero', () => {
  const mese: MonthTotal = { month: '2026-08', total: 1100, fixed: 300, variable: 800, count: 30 }
  const proiezione: Projection = {
    projected: 1270,
    method: 'stimato',
    elapsedDays: 20,
    totalDays: 31,
    projectedVariable: 1000,
    expectedFixed: 470,
  }
  const vista = computeMargin(mese, proiezione, PROFILE)
  const barra = marginBar(vista, { projectedVariable: proiezione.projectedVariable })!

  it('copre esattamente il cento per cento', () => {
    const somma = barra.segments.reduce((acc, s) => acc + s.pct, 0)
    expect(somma).toBeCloseTo(100, 6)
  })

  /* La somma dei segmenti **è** il conto riga per riga della scheda: se la barra
     e le righe potessero divergere, una delle due mentirebbe. */
  it('i segmenti sommano alle entrate', () => {
    const somma = barra.segments.reduce((acc, s) => acc + s.amount, 0)
    expect(somma).toBeCloseTo(vista.income, 2)
    expect(barra.total).toBe(vista.income)
  })

  it('mette in coda lo spendibile, ed è quello che dice il numero grande', () => {
    const resto = barra.segments.find((s) => s.key === 'resto')
    expect(resto?.amount).toBe(vista.spendable)
    expect(barra.segments[barra.segments.length - 1]?.key).toBe('resto')
  })

  it('l’ordine è quello in cui i soldi smettono di essere tuoi', () => {
    expect(barra.segments.map((s) => s.key)).toEqual([
      'risparmio',
      'fisse',
      'attese',
      'variabili',
      'resto',
    ])
  })

  /*
   * È la richiesta, alla lettera: «la parte tratteggiata diventa continua quando
   * inserisco l'effettivo affitto pagato questo mese». Il tratteggio non si
   * accorcia soltanto — sparisce — e la sua lunghezza passa al pieno.
   */
  it('il tratteggio sparisce quando la fissa arriva, e il pieno cresce di altrettanto', () => {
    const attese = barra.segments.find((s) => s.key === 'attese')
    expect(attese?.amount).toBe(170) // 470 attese − 300 già arrivate

    const arrivata: MonthTotal = { ...mese, total: 1270, fixed: 470, variable: 800 }
    const dopo = marginBar(computeMargin(arrivata, { ...proiezione, expectedFixed: 470 }, PROFILE), {
      projectedVariable: 1000,
    })!
    expect(dopo.segments.find((s) => s.key === 'attese')).toBeUndefined()
    expect(dopo.segments.find((s) => s.key === 'fisse')?.amount).toBe(470)
    /* E lo spendibile non si è mosso: era già contato. */
    expect(dopo.segments.find((s) => s.key === 'resto')?.amount).toBe(
      barra.segments.find((s) => s.key === 'resto')?.amount,
    )
  })

  it('la tacca sta dove arrivi a questo ritmo', () => {
    /* risparmio 300 + fisse attese 470 + variabili proiettate 1000 = 1770 su 2668,33 */
    expect(barra.projectionPct).toBeCloseTo((1770 / 2668.33) * 100, 4)
  })

  it('a mese chiuso la tacca non c’è', () => {
    expect(marginBar(vista, { projectedVariable: null })?.projectionPct).toBeNull()
  })
})

describe('la barra quando si è andati oltre', () => {
  /* Entrate 2668,33 − risparmio 300 − fisse 470 = 1898,33 di fondo: 2000 lo sfonda. */
  const mese: MonthTotal = { month: '2026-08', total: 2470, fixed: 470, variable: 2000, count: 40 }
  const proiezione: Projection = {
    projected: 2470,
    method: 'chiuso',
    elapsedDays: 31,
    totalDays: 31,
    projectedVariable: 2000,
    expectedFixed: 470,
  }
  const vista = computeMargin(mese, proiezione, PROFILE)
  const barra = marginBar(vista, { projectedVariable: null })!

  it('lo spendibile è negativo e la coda vuota non c’è', () => {
    expect(vista.spendable).toBeLessThan(0)
    expect(barra.segments.find((s) => s.key === 'resto')).toBeUndefined()
  })

  it('l’eccedenza è un segmento suo, lungo quanto si è sforato', () => {
    const eccedenza = barra.segments.find((s) => s.key === 'eccedenza')
    expect(eccedenza?.amount).toBeCloseTo(-vista.spendable, 2)
  })

  it('la barra resta piena invece di sfondare', () => {
    expect(barra.segments.reduce((acc, s) => acc + s.pct, 0)).toBeCloseTo(100, 6)
    expect(barra.total).toBeGreaterThan(vista.income)
  })

  /*
   * Il caso patologico: risparmio e fisse **da soli** superano le entrate, cioè
   * non ti puoi permettere l'affitto. È l'unico ramo in cui l'eccedenza va
   * limitata alle variabili: senza il taglio verrebbe più lunga di loro, e il
   * segmento delle variabili «dentro» diventerebbe negativo. → ADR-0066
   */
  it('quando non ti puoi permettere le fisse, il rosso vale tutte le variabili', () => {
    const povero: IncomeProfile = { ...PROFILE, netMonthly: 400, extraMonths: 0, annualBonusNet: 0 }
    const risultato = computeMargin(
      { month: '2026-08', total: 1100, fixed: 300, variable: 800, count: 30 },
      { ...proiezione, expectedFixed: 470 },
      povero,
    )
    expect(risultato.discretionaryBudget).toBeLessThan(0)
    const b = marginBar(risultato, { projectedVariable: null })!
    const seg = (key: string): number => b.segments.find((x) => x.key === key)?.amount ?? 0
    expect(seg('eccedenza')).toBeCloseTo(risultato.variableSpent, 2)
    expect(seg('variabili')).toBe(0)
    expect(b.segments.reduce((acc, x) => acc + x.pct, 0)).toBeCloseTo(100, 6)
  })
})

describe('la barra a guadagni oscurati', () => {
  const mese: MonthTotal = { month: '2026-08', total: 1100, fixed: 300, variable: 800, count: 30 }
  const proiezione: Projection = {
    projected: 1270,
    method: 'stimato',
    elapsedDays: 20,
    totalDays: 31,
    projectedVariable: 1000,
    expectedFixed: 470,
  }

  /*
   * La barra si compone **anche** a guadagni oscurati, e deve venire identica:
   * non ha bisogno delle entrate, perché il suo fondo è l'impegnato più ciò che
   * avanza — che è la stessa misura scritta senza nominarle. Se un giorno
   * divergesse, vorrebbe dire che una delle due strade ha smesso di essere la
   * definizione dell'altra. → ADR-0066
   */
  it('si compone identica, coperta o no', () => {
    const risultato = computeMargin(mese, proiezione, PROFILE)
    const chiara = marginBar(risultato, { projectedVariable: 1000 })
    const coperta = marginBar(marginView(risultato, { hideIncome: true }), {
      projectedVariable: 1000,
    })
    expect(coperta).toEqual(chiara)
    expect(coperta).not.toBeNull()
  })

  it('il totale della barra resta le entrate, che però non passano di qui', () => {
    /* Il totale disegnato **è** le entrate: è il limite dichiarato di ADR-0066,
       e questo test lo tiene scritto invece di lasciarlo scoprire. */
    const risultato = computeMargin(mese, proiezione, PROFILE)
    const barra = marginBar(marginView(risultato, { hideIncome: true }), {
      projectedVariable: 1000,
    })
    expect(barra?.total).toBe(risultato.income)
  })

  it('e nemmeno senza profilo entrate', () => {
    const senza = computeMargin(mese, proiezione, { ...PROFILE, configured: false })
    expect(marginBar(senza, { projectedVariable: 1000 })).toBeNull()
  })
})
