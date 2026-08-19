import { describe, expect, it } from 'vitest'

import { computeMargin, incomeBreakdown, marginStatus } from './income'
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
