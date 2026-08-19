/**
 * Dal «quanto ho speso» al «quanto margine ho».
 *
 * Le entrate non stanno nei tricount: vivono nel profilo entrate di config,
 * compilato con l'intervista a tempo zero. Finché `configured` è false l'app
 * lo dice apertamente invece di mostrare un margine costruito su numeri finti.
 */

import { round2 } from './money'
import type { MonthTotal, Projection } from './selectors'
import type { IncomeProfile } from './types'

export const EMPTY_INCOME: IncomeProfile = {
  configured: false,
  netMonthly: 0,
  extraMonths: 0,
  annualBonusNet: 0,
  mealVouchers: { valuePerDay: 0, daysPerMonth: 0 },
  otherMonthlyNet: 0,
  monthlySavingsTarget: 0,
}

export interface IncomeBreakdown {
  stipendio: number
  buoniPasto: number
  /** Mensilità aggiuntive e bonus, spalmati sui dodici mesi. */
  differite: number
  altro: number
  totale: number
}

/**
 * Entrate mensili «spendibili». Tredicesima e bonus vengono spalmati su dodici
 * mesi: senza spalmarli, dicembre sembrerebbe un mese di abbondanza e gli altri
 * undici di ristrettezza, che non è come si vive un budget.
 */
export function incomeBreakdown(profile: IncomeProfile): IncomeBreakdown {
  const stipendio = profile.netMonthly
  const buoniPasto = round2(profile.mealVouchers.valuePerDay * profile.mealVouchers.daysPerMonth)
  const differite = round2((profile.netMonthly * profile.extraMonths + profile.annualBonusNet) / 12)
  const altro = profile.otherMonthlyNet
  return {
    stipendio,
    buoniPasto,
    differite,
    altro,
    totale: round2(stipendio + buoniPasto + differite + altro),
  }
}

export function monthlyIncome(profile: IncomeProfile): number {
  return incomeBreakdown(profile).totale
}

export type MarginStatus = 'ok' | 'attenzione' | 'oltre' | 'sconosciuto'

export interface MarginResult {
  /** false quando il profilo entrate non è ancora stato compilato. */
  known: boolean
  income: number
  breakdown: IncomeBreakdown
  spent: number
  /** Entrate meno spese, a oggi. */
  margin: number
  /** Quota di entrate già spesa, 0–1 (può superare 1). */
  usedPct: number
  projectedSpent: number
  projectedMargin: number
  savingsTarget: number
  /** Margine al netto dell'obiettivo di risparmio: è quello davvero libero. */
  marginAfterSavings: number
  projectedMarginAfterSavings: number
  status: MarginStatus
}

/**
 * Semaforo del mese. `oltre` scatta quando la proiezione supera le entrate,
 * `attenzione` quando mangia l'obiettivo di risparmio o supera il 90% delle entrate.
 */
export function marginStatus(
  income: number,
  projectedSpent: number,
  savingsTarget: number,
): MarginStatus {
  if (income <= 0) return 'sconosciuto'
  if (projectedSpent >= income) return 'oltre'
  if (projectedSpent > income - savingsTarget || projectedSpent / income > 0.9) return 'attenzione'
  return 'ok'
}

export function computeMargin(
  month: MonthTotal,
  projection: Projection,
  profile: IncomeProfile,
): MarginResult {
  const breakdown = incomeBreakdown(profile)
  const income = breakdown.totale
  const spent = month.total
  const savingsTarget = profile.monthlySavingsTarget
  const projectedSpent = projection.projected
  return {
    known: profile.configured && income > 0,
    income,
    breakdown,
    spent,
    margin: round2(income - spent),
    usedPct: income > 0 ? spent / income : 0,
    projectedSpent,
    projectedMargin: round2(income - projectedSpent),
    savingsTarget,
    marginAfterSavings: round2(income - spent - savingsTarget),
    projectedMarginAfterSavings: round2(income - projectedSpent - savingsTarget),
    status: profile.configured ? marginStatus(income, projectedSpent, savingsTarget) : 'sconosciuto',
  }
}

/** Quanto puoi ancora spendere al giorno per chiudere il mese dentro le entrate. */
export function dailyAllowance(result: MarginResult, projection: Projection): number {
  const remainingDays = Math.max(1, projection.totalDays - projection.elapsedDays)
  return round2(Math.max(0, result.marginAfterSavings) / remainingDays)
}
