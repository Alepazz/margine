import { describe, expect, it } from 'vitest'

import { computeMargin, incomeBreakdown, marginStatus, marginView } from './income'
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
    'fixedStillDue',
  ]

  it('lascia in chiaro solo i campi che parlano di spese', () => {
    const view = marginView(result, { hideIncome: true })
    for (const key of VISIBILI) {
      expect(view[key as keyof typeof view]).toBe(result[key as keyof typeof result])
    }
  })

  it('azzera ogni altro campo, compresi quelli da cui le entrate si ricavano per sottrazione', () => {
    const view = marginView(result, { hideIncome: true })
    const azzerati = Object.keys(result).filter((key) => !VISIBILI.includes(key))
    // Se questo elenco si svuota, il test non sta più presidiando niente.
    expect(azzerati.length).toBeGreaterThan(5)
    for (const key of azzerati) {
      expect(view[key as keyof typeof view]).toBeNull()
    }
  })

  it('non tocca niente quando i guadagni sono in chiaro', () => {
    expect(marginView(result, { hideIncome: false })).toEqual(result)
  })
})
