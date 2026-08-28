/**
 * Dal «quanto ho speso» al «quanto margine ho».
 *
 * Le entrate non stanno nei tricount: vivono nel profilo entrate di config,
 * compilato con l'intervista a tempo zero. Finché `configured` è false l'app
 * lo dice apertamente invece di mostrare un margine costruito su numeri finti.
 */

import { fromCents, round2, toCents } from './money'
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
   * Fisse **già addebitate** questo mese. Insieme a `fixedStillDue` compone
   * `expectedFixed`, e serve a distinguere il pieno dal tratteggio nella barra:
   * l'affitto pagato e l'affitto atteso valgono lo stesso nel conto, ma non
   * sono la stessa cosa da guardare. → ADR-0057
   */
  fixedSpent: number
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
    fixedSpent: month.fixed,
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
 * Il velo copre **quanto guadagni**, non **quanto puoi spendere**: sono due
 * domande diverse, e la seconda è tutta l'app. Coprire anche quella rendeva
 * l'oscuramento inservibile proprio nel momento per cui esiste — mostrare
 * l'app a qualcuno — e quindi lo teneva spento. → ADR-0066
 *
 * Il limite è dichiarato e non è un difetto da tappare: le righe visibili sono
 * una sottrazione a cui manca la prima, quindi chi le somma ricava il totale.
 * Deve però sommarle, e ciò che ottiene è un profilo **stimato dalla RAL**, non
 * una busta paga. Protegge dallo sguardo, non dall'aritmetica, com'è già per la
 * separazione dei compartimenti personali (→ ADR-0039).
 *
 * Non si vela il numero nella vista: non si dà il numero alla vista. Qui si
 * azzerano i campi, e il componente disegna «•••» dove trova `null` — così la
 * regola vive in una funzione pura che un test può presidiare, senza dover
 * montare l'interfaccia.
 */

/**
 * I campi che restano leggibili a guadagni oscurati. Due famiglie:
 *
 * - le **spese** e i soldi già impegnati, che si ricavano dalla storia delle
 *   spese e non dalle entrate (`spent`, `projectedSpent`, `expectedFixed`,
 *   `variableSpent`, `fixedSpent`, `fixedStillDue`);
 * - ciò che **resta da spendere** (`spendable`, `spendablePerDay`) e ciò che è
 *   messo da parte (`savingsTarget`), che sono la risposta dell'app e non un
 *   guadagno. → ADR-0066
 *
 * Restano coperti `income` e `breakdown` — i guadagni nudi — e tutto ciò che è
 * «entrate meno qualcosa» (`margin`, `marginAfterSavings`, `projectedMargin`,
 * `projectedMarginAfterSavings`, `discretionaryBudget`, `usedPct`): quelli non
 * chiedono una somma, basta leggerli.
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
  'fixedSpent',
  'fixedStillDue',
  'savingsTarget',
  'spendable',
  'spendablePerDay',
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

/*
 * ─────────────────────── la barra: il mese intero ───────────────────────
 *
 * ADR-0015 aveva fatto della barra un rapporto contro il **fondo
 * discrezionale**: piena = variabili già spese. Diceva il vero e nascondeva
 * proprio ciò che serviva capire — dove finiscono i soldi che il fondo non
 * contiene. Risparmio e fisse stanno *fuori* da quel limite per costruzione,
 * quindi in quella barra non c'era posto per mostrarli, e l'affitto sembrava
 * arrivare dal nulla il giorno che lo si registrava.
 *
 * Ora il fondo della barra sono le **entrate**, e i soldi del mese si vedono
 * tutti, nell'ordine in cui smettono di essere tuoi. → ADR-0057
 */

/*
 * **`eccedenza` e non `oltre`**: `oltre` è già uno stato del semaforo, e le due
 * cose finivano nella stessa classe CSS — la regola dell'eccedenza colpiva
 * anche il segmento delle variabili, che quando si sfora porta `is-oltre` per
 * via del semaforo. Misurato: il filo che segna la riga delle entrate veniva
 * disegnato due volte, in due posti diversi.
 */
export type MarginSegmentKey =
  | 'risparmio'
  | 'fisse'
  | 'attese'
  | 'variabili'
  | 'eccedenza'
  | 'resto'

export interface MarginSegment {
  key: MarginSegmentKey
  amount: number
  /** Quota della barra, 0–100. */
  pct: number
}

export interface MarginBar {
  /** In ordine, da sinistra. I segmenti a zero non ci sono. */
  segments: MarginSegment[]
  /** Il denominatore: le entrate, o quanto è impegnato se le si è superate. */
  total: number
  /**
   * Quanto del mese è già impegnato: tutto tranne la coda vuota. Sta qui e non
   * si ricostruisce fuori — `total − spendibile` è la stessa cosa solo grazie a
   * un'identità che vale in un ramo e non nell'altro.
   */
  committed: number
  /** Dove arrivi a questo ritmo, 0–100. `null` a mese chiuso. */
  projectionPct: number | null
}

/*
 * I segmenti non portano un'etichetta.
 *
 * Ce l'avevano, e serviva al solo `title` del pezzo di barra: un suggerimento
 * che sul telefono non compare mai — e questa è un'app che si usa in piedi con
 * un pollice — mentre a schermo largo mostrava un numero che sta già in chiaro
 * quaranta pixel più sotto, nella riga del conto con lo stesso pallino. Tre
 * stringhe duplicate per niente.
 */

/**
 * I segmenti della barra, in centesimi interi e senza React.
 *
 * Torna `null` quando non c'è niente da disegnare: profilo entrate non
 * compilato, entrate a zero, o guadagni oscurati — e in quel caso è `income` a
 * essere `null`, quindi la barra non si può comporre nemmeno volendo. È la
 * stessa protezione di `marginView()` un piano più in là: la vista non riceve i
 * numeri, quindi non può rivelarli con le proporzioni.
 */
export function marginBar(
  view: MarginView,
  opts: { projectedVariable: number | null },
): MarginBar | null {
  const { savingsTarget, spendable } = view
  if (!view.known) return null
  if (savingsTarget === null || spendable === null) return null

  const risparmio = Math.max(0, toCents(savingsTarget))
  const fisse = Math.max(0, toCents(view.fixedSpent))
  const attese = Math.max(0, toCents(view.fixedStillDue))
  const variabili = Math.max(0, toCents(view.variableSpent))
  const spendibile = toCents(spendable)

  const impegnato = risparmio + fisse + attese + variabili
  /*
   * Il fondo della barra **erano** le entrate, e adesso è l'impegnato più ciò
   * che avanza: è la stessa identica misura — lo spendibile è per definizione
   * entrate meno impegnato — scritta senza mai nominare le entrate, che a
   * guadagni oscurati non arrivano fin qui. Quando si è speso più di quanto si
   * aveva lo spendibile è negativo, il resto sparisce e la barra resta piena
   * invece di sfondare. → ADR-0066
   */
  const resto = Math.max(0, spendibile)
  const totale = impegnato + resto
  if (totale <= 0) return null

  /*
   * L'eccedenza è esattamente quanto lo spendibile è finito **sotto zero**, e si
   * stacca dalle **variabili**, che è da dove arriva sempre nella pratica. Il
   * `min` è per il caso patologico in cui risparmio e fisse da soli superino le
   * entrate — cioè non ti puoi permettere l'affitto: là il pezzo rosso vale
   * tutte le variabili invece della sola parte oltre la riga, e dice comunque
   * «sei oltre», che è l'unica cosa che conta a quel punto.
   */
  const eccedenza = Math.min(variabili, Math.max(0, -spendibile))
  const dentro = variabili - eccedenza

  const quota = (cents: number): number => (cents / totale) * 100
  const segments: MarginSegment[] = []
  const push = (key: MarginSegmentKey, cents: number): void => {
    if (cents <= 0) return
    segments.push({ key, amount: fromCents(cents), pct: quota(cents) })
  }

  push('risparmio', risparmio)
  push('fisse', fisse)
  push('attese', attese)
  push('variabili', dentro)
  push('eccedenza', eccedenza)
  push('resto', resto)

  const projectedVariable = opts.projectedVariable
  const projectionPct =
    projectedVariable === null
      ? null
      : Math.min(
          100,
          Math.max(0, quota(risparmio + fisse + attese + Math.max(0, toCents(projectedVariable)))),
        )

  return {
    segments,
    total: fromCents(totale),
    committed: fromCents(impegnato),
    projectionPct,
  }
}
