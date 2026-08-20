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
  /** Entrate meno spese, a oggi. Quanto c'è in cassa, non quanto è spendibile. */
  margin: number
  /** Quota di entrate già spesa, 0–1 (può superare 1). */
  usedPct: number
  projectedSpent: number
  projectedMargin: number
  savingsTarget: number
  /** Margine al netto dell'obiettivo di risparmio. */
  marginAfterSavings: number
  projectedMarginAfterSavings: number
  /** Fisse attese a fine mese: già addebitate o, se non ancora arrivate, la media storica. */
  expectedFixed: number
  /** Parte discrezionale già spesa: è la sola su cui si può ancora incidere. */
  variableSpent: number
  /**
   * Il fondo discrezionale del mese: entrate meno risparmio e fisse attese.
   * È il limite contro cui si misura quanto si è già speso — non le entrate,
   * che comprendono soldi che non sono mai stati spendibili.
   */
  discretionaryBudget: number
  /**
   * Fisse che devono ancora arrivare. Sono soldi già impegnati anche se non si
   * vedono ancora sul conto: il 20 di agosto l'affitto non è uscito, ma uscirà.
   */
  fixedStillDue: number
  /**
   * **Il numero grande.** Quanto si può ancora spendere da qui a fine mese:
   * entrate meno l'obiettivo di risparmio, meno le fisse attese, meno le
   * variabili già spese. → ADR-0015
   */
  spendable: number
  /** Lo stesso, diviso per i giorni che restano. Senso solo a mese aperto. */
  spendablePerDay: number
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

  /*
   * Lo spendibile toglie dalle entrate tutto ciò che è già impegnato: il
   * risparmio, le fisse attese — comprese quelle che non sono ancora arrivate —
   * e le variabili già spese. È la risposta a «quanto posso ancora spendere»,
   * che è una domanda diversa da «quanto è rimasto in cassa». → ADR-0015
   *
   * A mese chiuso `expectedFixed` è `month.fixed`, quindi lo spendibile
   * coincide con `marginAfterSavings`: sui mesi passati la formula nuova dà lo
   * stesso numero della vecchia, e la storia non si muove di un centesimo.
   */
  const expectedFixed = projection.expectedFixed
  const discretionaryBudget = round2(income - savingsTarget - expectedFixed)
  const spendable = round2(discretionaryBudget - month.variable)
  const remainingDays = Math.max(1, projection.totalDays - projection.elapsedDays)

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
    expectedFixed,
    variableSpent: month.variable,
    discretionaryBudget,
    fixedStillDue: round2(Math.max(0, expectedFixed - month.fixed)),
    spendable,
    spendablePerDay: round2(Math.max(0, spendable) / remainingDays),
    status: profile.configured ? marginStatus(income, projectedSpent, savingsTarget) : 'sconosciuto',
  }
}

/*
 * ─────────────────────── oscurare i guadagni ───────────────────────
 *
 * Nascondere la riga «entrate» non nasconde le entrate: ogni altro numero
 * della scheda le restituisce per sottrazione (margine + speso, speso / quota
 * spesa, spendibile + risparmio + fisse + variabili), e il riempimento della
 * barra **è** la quota spesa, senza bisogno di leggere una cifra.
 *
 * Quindi non si vela il numero nella vista: non si dà il numero alla vista.
 * Qui si azzerano i campi, e il componente disegna «•••» dove trova `null` —
 * così la regola vive in una funzione pura che un test può presidiare, senza
 * dover montare l'interfaccia.
 */

/**
 * Gli unici campi che restano leggibili a guadagni oscurati: parlano di spese
 * (`spent`, `projectedSpent`) o di soldi già impegnati che si ricavano dalla
 * storia delle spese, non dalle entrate (`expectedFixed`, `fixedStillDue`).
 *
 * È una lista di **ciò che si vede**, non di ciò che si nasconde: un campo
 * nuovo in `MarginResult` risulta segreto per difetto. Al contrario, prima o
 * poi qualcuno ne aggiungerebbe uno dimenticandosi di coprirlo.
 */
const PUBLIC_MARGIN_FIELDS = [
  'known',
  'status',
  'spent',
  'projectedSpent',
  'expectedFixed',
  'variableSpent',
  'fixedStillDue',
] as const

type PublicField = (typeof PUBLIC_MARGIN_FIELDS)[number]

const PUBLIC = new Set<string>(PUBLIC_MARGIN_FIELDS)

/** Come `MarginResult`, ma i campi che rivelano le entrate possono essere `null`. */
export type MarginView = {
  [K in keyof MarginResult]: K extends PublicField ? MarginResult[K] : MarginResult[K] | null
}

export function marginView(result: MarginResult, opts: { hideIncome: boolean }): MarginView {
  if (!opts.hideIncome) return result
  const veiled: Record<string, unknown> = { ...result }
  for (const key of Object.keys(veiled)) {
    if (!PUBLIC.has(key)) veiled[key] = null
  }
  return veiled as MarginView
}
