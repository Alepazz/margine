/**
 * Tutte le statistiche di Margine, come funzioni pure.
 *
 * Convenzione: `visibleFor()` applica una volta il filtro di vista (persona +
 * vacanze sì/no); tutti gli altri selettori ricevono una lista già filtrata e
 * la persona, così non c'è ambiguità su chi ha già filtrato cosa.
 */

import {
  addMonths,
  dayOf,
  daysInMonth,
  daysInclusive,
  elapsedDaysInMonth,
  monthKeyOf,
  monthRange,
  parseMonthKey,
  yearOf,
  type MonthKey,
} from './dates'
import { round2, sumBy, toCents } from './money'
import { nameKey } from './text'
import type { Expense, PersonId, Settlement, Tricount, Trip } from './types'

export interface ViewOptions {
  person: PersonId
  /**
   * Una settimana di viaggio fa sembrare «fuori media» un mese normale:
   * di default le vacanze restano fuori dalle statistiche mensili ordinarie.
   */
  includeVacations: boolean
}

/**
 * Il valore di partenza della vista. `person` è qui solo perché il tipo lo
 * vuole: chi crea la vista lo sovrascrive **sempre** con l'identità del
 * dispositivo, e senza identità l'app non arriva a renderizzare una pagina
 * (→ ADR-0042). Non è «la persona predefinita»: quella non esiste più.
 */
export const DEFAULT_VIEW: ViewOptions = { person: 'me', includeVacations: false }

/**
 * Gli id dei tricount che sono viaggi: è l'insieme con cui «vacanze incluse»
 * decide. Prima bastava `source === 'vacanze'`; ora la vacanza è una proprietà
 * del tricount, quindi il filtro ha bisogno di sapere quali lo sono. → ADR-0037
 */
export function vacationIdsOf(tricounts: readonly Tricount[]): Set<string> {
  return new Set(tricounts.filter((t) => t.trip).map((t) => t.id))
}

export function shareOf(expense: Expense, person: PersonId): number {
  return expense.shares[person] ?? 0
}

/** Quanto di quella spesa è uscito dalle vostre tasche, sommando i due. */
export function coupleShare(expense: Expense): number {
  return round2(expense.shares.me + expense.shares.partner)
}

/** Quanto di quella spesa era di altre persone: zero fuori dalle vacanze di gruppo. */
export function othersShare(expense: Expense): number {
  return expense.shares.others ?? 0
}

/**
 * Vero quando la spesa è stata pagata col welfare **da questa persona**: per lei
 * non è un'uscita, perché quei soldi non sono mai passati dal suo conto e non
 * stanno fra le sue entrate. Per l'altra la quota resta una spesa normale: quella
 * la rimborsa in contanti. → ADR-0014
 */
export function fundedByWelfare(expense: Expense, person: PersonId): boolean {
  return expense.welfare === true && expense.paidBy === person
}

/**
 * Quanto di questa spesa non è uscito da nessuna tasca.
 *
 * Il welfare paga tutto il conto, ma la quota dell'altra persona rientra in
 * contanti: l'unica parte davvero risparmiata è quella di chi ha anticipato.
 */
export function welfareShare(expense: Expense): number {
  if (expense.welfare !== true || expense.paidBy === 'others') return 0
  return shareOf(expense, expense.paidBy)
}

/**
 * Le spese che erodono il budget della persona selezionata, nella vista richiesta.
 *
 * È il filtro delle **statistiche mensili**: margine, medie, andamento, categorie,
 * confronti. Le pagine che raccontano un fatto invece di misurare un budget — Spese,
 * Vacanze, 730, Gatto — hanno il loro perimetro e non passano da qui.
 */
export function visibleFor(
  expenses: readonly Expense[],
  view: ViewOptions,
  vacationIds: ReadonlySet<string>,
): Expense[] {
  return expenses.filter(
    (e) =>
      toCents(shareOf(e, view.person)) > 0 &&
      (view.includeVacations || !vacationIds.has(e.tricount)) &&
      !fundedByWelfare(e, view.person),
  )
}

/** Come `visibleFor`, ma senza escludere le vacanze (per le viste che le vogliono sempre). */
export function allFor(expenses: readonly Expense[], person: PersonId): Expense[] {
  return expenses.filter((e) => toCents(shareOf(e, person)) > 0)
}

export function totalShare(expenses: readonly Expense[], person: PersonId): number {
  return sumBy(expenses, (e) => shareOf(e, person))
}

/** Il totale fatturato, quote di terzi comprese: è il numero che riconcilia con Tricount. */
export function totalAmount(expenses: readonly Expense[]): number {
  return sumBy(expenses, (e) => e.amount)
}

/** Quanto è uscito dalle vostre tasche in due. Fuori dalle vacanze di gruppo coincide con `totalAmount`. */
export function totalCouple(expenses: readonly Expense[]): number {
  return sumBy(expenses, coupleShare)
}

export function totalOthers(expenses: readonly Expense[]): number {
  return sumBy(expenses, othersShare)
}

export function monthsOf(expenses: readonly Expense[]): MonthKey[] {
  const set = new Set<MonthKey>()
  for (const e of expenses) set.add(monthKeyOf(e.date))
  return [...set].sort()
}

/** Anni presenti, dal più recente. */
export function yearsOf(expenses: readonly Expense[]): number[] {
  const set = new Set<number>()
  for (const e of expenses) set.add(yearOf(e.date))
  return [...set].sort((a, b) => b - a)
}

export function groupByMonth(expenses: readonly Expense[]): Map<MonthKey, Expense[]> {
  const map = new Map<MonthKey, Expense[]>()
  for (const e of expenses) {
    const key = monthKeyOf(e.date)
    const bucket = map.get(key)
    if (bucket) bucket.push(e)
    else map.set(key, [e])
  }
  return map
}

export function expensesOfMonth(
  visible: readonly Expense[],
  month: MonthKey,
): Expense[] {
  return visible.filter((e) => monthKeyOf(e.date) === month).sort(byDateDesc)
}

function byDateDesc(a: Expense, b: Expense): number {
  if (a.date === b.date) return b.amount - a.amount
  return a.date < b.date ? 1 : -1
}

// ─────────────────────────────── serie mensile ───────────────────────────────

export interface MonthTotal {
  month: MonthKey
  /** Quota della persona selezionata. */
  total: number
  /** Parte incomprimibile (spese ricorrenti). */
  fixed: number
  /** Parte discrezionale: è qui che vive il margine. */
  variable: number
  count: number
}

export function monthlySeries(visible: readonly Expense[], person: PersonId): MonthTotal[] {
  const grouped = groupByMonth(visible)
  const out: MonthTotal[] = []
  for (const [month, items] of grouped) {
    const fixed = sumBy(
      items.filter((e) => e.recurring),
      (e) => shareOf(e, person),
    )
    const total = sumBy(items, (e) => shareOf(e, person))
    out.push({ month, total, fixed, variable: round2(total - fixed), count: items.length })
  }
  return out.sort((a, b) => (a.month < b.month ? -1 : 1))
}

/** Inserisce i mesi vuoti fra il primo e l'ultimo: un mese a zero deve abbassare la media. */
export function fillMonthGaps(series: readonly MonthTotal[]): MonthTotal[] {
  if (series.length === 0) return []
  const first = series[0]!.month
  const last = series[series.length - 1]!.month
  const byMonth = new Map(series.map((s) => [s.month, s]))
  return monthRange(first, last).map(
    (month) => byMonth.get(month) ?? { month, total: 0, fixed: 0, variable: 0, count: 0 },
  )
}

export function findMonth(series: readonly MonthTotal[], month: MonthKey): MonthTotal {
  return series.find((s) => s.month === month) ?? { month, total: 0, fixed: 0, variable: 0, count: 0 }
}

export interface Average {
  perMonth: number
  fixedPerMonth: number
  variablePerMonth: number
  /** Su quanti mesi è calcolata: sotto i 3 la media dice ancora poco. */
  months: number
}

export const EMPTY_AVERAGE: Average = { perMonth: 0, fixedPerMonth: 0, variablePerMonth: 0, months: 0 }

/**
 * Media storica. Il mese in corso va escluso: è parziale e abbasserebbe la media
 * proprio mentre la si usa per giudicarlo.
 */
export function averageMonthly(
  series: readonly MonthTotal[],
  opts: { excludeMonth?: MonthKey; lastN?: number } = {},
): Average {
  let rows = fillMonthGaps(series)
  if (opts.excludeMonth) rows = rows.filter((r) => r.month !== opts.excludeMonth)
  if (opts.lastN && rows.length > opts.lastN) rows = rows.slice(-opts.lastN)
  if (rows.length === 0) return EMPTY_AVERAGE
  return {
    perMonth: round2(sumBy(rows, (r) => r.total) / rows.length),
    fixedPerMonth: round2(sumBy(rows, (r) => r.fixed) / rows.length),
    variablePerMonth: round2(sumBy(rows, (r) => r.variable) / rows.length),
    months: rows.length,
  }
}

// ─────────────────────────────── categorie ───────────────────────────────

export interface CategorySlice {
  key: string
  total: number
  /** Frazione sul totale della fetta, 0–1. */
  pct: number
  count: number
}

function sliceBy(
  scope: readonly Expense[],
  person: PersonId,
  keyOf: (e: Expense) => string | undefined,
): CategorySlice[] {
  const totals = new Map<string, { total: number; count: number }>()
  for (const e of scope) {
    const key = keyOf(e)
    if (key === undefined) continue
    const cur = totals.get(key) ?? { total: 0, count: 0 }
    totals.set(key, { total: cur.total + toCents(shareOf(e, person)), count: cur.count + 1 })
  }
  const grand = [...totals.values()].reduce((acc, v) => acc + v.total, 0)
  return [...totals.entries()]
    /* Una fetta da zero non è informazione: capita con le spese di gruppo in cui
       la quota è tutta di altri, e in un grafico resta solo come etichetta vuota. */
    .filter(([, v]) => v.total > 0)
    .map(([key, v]) => ({
      key,
      total: v.total / 100,
      pct: grand === 0 ? 0 : v.total / grand,
      count: v.count,
    }))
    .sort((a, b) => b.total - a.total)
}

export function categoryBreakdown(scope: readonly Expense[], person: PersonId): CategorySlice[] {
  return sliceBy(scope, person, (e) => e.category)
}

export function subcategoryBreakdown(
  scope: readonly Expense[],
  person: PersonId,
  category: string,
): CategorySlice[] {
  return sliceBy(
    scope.filter((e) => e.category === category),
    person,
    (e) => e.subcategory ?? 'altro',
  )
}

/**
 * Composizione di un viaggio. Le spese di vacanza stanno tutte in una categoria,
 * quindi spezzarle per categoria darebbe una fetta sola: il livello che dice
 * qualcosa è la sottocategoria (alloggio, trasporti, attività, cibo, souvenir).
 */
export function tripBreakdown(scope: readonly Expense[], person: PersonId): CategorySlice[] {
  return sliceBy(scope, person, (e) => e.subcategory ?? e.category)
}

/** Media mensile per categoria, sui mesi osservati (mese escluso a parte). */
export function averageByCategory(
  visible: readonly Expense[],
  person: PersonId,
  opts: { excludeMonth?: MonthKey } = {},
): Map<string, number> {
  const scope = opts.excludeMonth
    ? visible.filter((e) => monthKeyOf(e.date) !== opts.excludeMonth)
    : [...visible]
  const months = fillMonthGaps(monthlySeries(scope, person)).length
  const out = new Map<string, number>()
  if (months === 0) return out
  for (const slice of categoryBreakdown(scope, person)) {
    out.set(slice.key, round2(slice.total / months))
  }
  return out
}

export interface CategoryComparison {
  key: string
  current: number
  average: number
  /** Scostamento assoluto: positivo = stai spendendo più della tua media. */
  delta: number
  /** Scostamento relativo, `null` se non c'è storia con cui confrontare. */
  deltaPct: number | null
}

export function compareToAverage(
  current: readonly CategorySlice[],
  averages: Map<string, number>,
): CategoryComparison[] {
  const keys = new Set<string>([...current.map((c) => c.key), ...averages.keys()])
  const out: CategoryComparison[] = []
  for (const key of keys) {
    const cur = current.find((c) => c.key === key)?.total ?? 0
    const avg = averages.get(key) ?? 0
    out.push({
      key,
      current: cur,
      average: avg,
      delta: round2(cur - avg),
      deltaPct: toCents(avg) === 0 ? null : (cur - avg) / avg,
    })
  }
  return out.sort((a, b) => b.delta - a.delta)
}

// ─────────────────────────────── proiezioni ───────────────────────────────

export interface Projection {
  /** Totale atteso a fine mese. */
  projected: number
  /** `chiuso` = il mese è finito, il numero è definitivo. */
  method: 'chiuso' | 'stimato'
  elapsedDays: number
  totalDays: number
  /** Parte variabile attesa a fine mese. */
  projectedVariable: number
  /** Fisse attese: quelle già addebitate o, se non ancora arrivate, la media storica. */
  expectedFixed: number
}

/**
 * Stima di fine mese. Le fisse non si proiettano linearmente (l'affitto non si
 * paga un trentesimo al giorno): si prende il maggiore fra quelle già addebitate
 * e la media storica, e si proietta solo la parte variabile.
 */
export function projectMonth(
  month: MonthTotal,
  today: string,
  averageFixed: number,
): Projection {
  const totalDays = daysInMonth(month.month)
  const elapsedDays = elapsedDaysInMonth(month.month, today)
  if (elapsedDays >= totalDays) {
    return {
      projected: round2(month.total),
      method: 'chiuso',
      elapsedDays,
      totalDays,
      projectedVariable: round2(month.variable),
      expectedFixed: round2(month.fixed),
    }
  }
  const expectedFixed = round2(Math.max(month.fixed, averageFixed))
  const projectedVariable = round2((month.variable / elapsedDays) * totalDays)
  return {
    projected: round2(expectedFixed + projectedVariable),
    method: 'stimato',
    elapsedDays,
    totalDays,
    projectedVariable,
    expectedFixed,
  }
}

export interface PeriodComparison {
  current: number
  previous: number
  delta: number
  deltaPct: number | null
  currentMonths: MonthKey[]
  previousMonths: MonthKey[]
}

function sumMonths(series: readonly MonthTotal[], months: readonly MonthKey[]): number {
  return sumBy(
    months.map((m) => findMonth(series, m)),
    (m) => m.total,
  )
}

/** Ultimi `span` mesi (mese in corso escluso) contro i `span` precedenti. */
export function comparePeriods(
  series: readonly MonthTotal[],
  currentMonth: MonthKey,
  span = 3,
): PeriodComparison {
  const currentMonths = Array.from({ length: span }, (_, i) => addMonths(currentMonth, -(i + 1))).reverse()
  const previousMonths = Array.from({ length: span }, (_, i) =>
    addMonths(currentMonth, -(span + i + 1)),
  ).reverse()
  const current = sumMonths(series, currentMonths)
  const previous = sumMonths(series, previousMonths)
  return {
    current,
    previous,
    delta: round2(current - previous),
    deltaPct: toCents(previous) === 0 ? null : (current - previous) / previous,
    currentMonths,
    previousMonths,
  }
}

export interface SameDaysComparison {
  /** Quota della persona nel mese scelto, nei primi `days` giorni. */
  current: number
  /** Lo stesso nel mese precedente. */
  previous: number
  previousMonth: MonthKey
  delta: number
  deltaPct: number | null
  /** Su quanti giorni è fatto il confronto. */
  days: number
  /**
   * Vero quando `days` copre il mese precedente per intero: capita sempre a
   * mese chiuso, e capita col 31 contro un mese da 30. Serve all'etichetta —
   * «primi 31 giorni» di un mese che ne ha 30 è una frase falsa.
   */
  wholePrevious: boolean
}

/**
 * Il mese scelto contro il precedente, **a pari giorni**.
 *
 * Il confronto col mese scorso è la statistica che si guarda per prima, e per il
 * mese in corso non si può fare fra un parziale e un mese intero: il 5 del mese
 * direbbe «−80%» a chiunque. Le due strade erano confrontare la proiezione col
 * mese intero — che è quello che si fa con la media (→ ADR-0011) — o tagliare
 * anche il mese scorso agli stessi giorni. Vince la seconda: non ha una stima
 * dentro, e a mese chiuso diventa da sé il confronto fra due mesi interi.
 * → ADR-0035
 */
export function compareSameDays(
  visible: readonly Expense[],
  person: PersonId,
  month: MonthKey,
  today: string,
): SameDaysComparison {
  const days = elapsedDaysInMonth(month, today)
  const previousMonth = addMonths(month, -1)
  const upTo = (key: MonthKey): number =>
    sumBy(
      visible.filter((e) => monthKeyOf(e.date) === key && dayOf(e.date) <= days),
      (e) => shareOf(e, person),
    )
  const current = upTo(month)
  const previous = upTo(previousMonth)
  return {
    current,
    previous,
    previousMonth,
    delta: round2(current - previous),
    deltaPct: toCents(previous) === 0 ? null : (current - previous) / previous,
    days,
    wholePrevious: days >= daysInMonth(previousMonth),
  }
}

/** Stesso mese dell'anno scorso. */
export function compareYearOverYear(
  series: readonly MonthTotal[],
  month: MonthKey,
): { current: number; lastYear: number; deltaPct: number | null; lastYearMonth: MonthKey } {
  const lastYearMonth = addMonths(month, -12)
  const current = findMonth(series, month).total
  const lastYear = findMonth(series, lastYearMonth).total
  return {
    current,
    lastYear,
    deltaPct: toCents(lastYear) === 0 ? null : (current - lastYear) / lastYear,
    lastYearMonth,
  }
}

// ──────────────────── statistiche di lungo periodo ────────────────────

/*
 * Queste guardano tutta la storia e non il mese scelto: è la ragione per cui
 * stanno in una pagina loro invece che nel Riepilogo, dove un mese selezionato
 * che non cambia metà della pagina è una promessa non mantenuta. → ADR-0034
 *
 * Convenzione comune a tutte: lavorano sulla serie **osservata**, senza i mesi
 * vuoti di `fillMonthGaps`. Un mese senza spese non è «il mese più leggero» e
 * non è un anno più corto: è un mese che non c'è. La media storica fa il
 * contrario, e a ragione — là un mese a zero deve abbassarla. → ADR-0011
 */

export interface YearTotal {
  year: number
  total: number
  /** Mesi osservati: il 2024 ne ha tre, e senza dirlo sembra un anno da [cifra rimossa]. */
  months: number
  /** Media al mese sui mesi osservati: è il numero con cui due anni si confrontano. */
  perMonth: number
}

/** Anno per anno, dal più recente. */
export function yearlyTotals(series: readonly MonthTotal[]): YearTotal[] {
  const map = new Map<number, MonthTotal[]>()
  for (const row of series) {
    const year = parseMonthKey(row.month).year
    const bucket = map.get(year)
    if (bucket) bucket.push(row)
    else map.set(year, [row])
  }
  return [...map.entries()]
    .map(([year, rows]) => {
      const total = sumBy(rows, (r) => r.total)
      return {
        year,
        total,
        months: rows.length,
        perMonth: rows.length === 0 ? 0 : round2(total / rows.length),
      }
    })
    .sort((a, b) => b.year - a.year)
}

/**
 * Il mese più caro e il più leggero. Il mese in corso si esclude: è parziale, e
 * vincerebbe come «più leggero» ogni primo del mese.
 */
export function extremeMonths(
  series: readonly MonthTotal[],
  opts: { excludeMonth?: MonthKey } = {},
): { highest: MonthTotal | null; lowest: MonthTotal | null } {
  const rows = series.filter((r) => r.month !== opts.excludeMonth && r.count > 0)
  if (rows.length === 0) return { highest: null, lowest: null }
  let highest = rows[0]!
  let lowest = rows[0]!
  for (const row of rows) {
    if (toCents(row.total) > toCents(highest.total)) highest = row
    if (toCents(row.total) < toCents(lowest.total)) lowest = row
  }
  return { highest, lowest }
}

export interface FixedSharePoint {
  month: MonthKey
  /** Quota incomprimibile sul totale del mese, 0–1. */
  share: number
}

export interface FixedShare {
  points: FixedSharePoint[]
  /** Media delle quote osservate, non quota della somma: pesa i mesi allo stesso modo. */
  average: number
  highest: FixedSharePoint | null
  lowest: FixedSharePoint | null
}

/**
 * Quanto del mese è incomprimibile, mese per mese.
 *
 * Il mese in corso va escluso, e qui più che altrove: l'affitto arriva il 3 e le
 * variabili si accumulano fino al 31, quindi il 5 del mese la quota di fisse è
 * vicina al 100% e vincerebbe come «mese più vincolato» tutti i mesi.
 */
export function fixedShareSeries(
  series: readonly MonthTotal[],
  opts: { excludeMonth?: MonthKey } = {},
): FixedShare {
  /* Un mese a zero non ha una quota di fisse: la divisione non esiste, e
     inventarle uno zero direbbe «quel mese era tutto discrezionale». */
  const points = series
    .filter((row) => toCents(row.total) > 0 && row.month !== opts.excludeMonth)
    .map((row) => ({ month: row.month, share: toCents(row.fixed) / toCents(row.total) }))
  if (points.length === 0) return { points: [], average: 0, highest: null, lowest: null }
  let highest = points[0]!
  let lowest = points[0]!
  for (const point of points) {
    if (point.share > highest.share) highest = point
    if (point.share < lowest.share) lowest = point
  }
  return {
    points,
    average: points.reduce((acc, p) => acc + p.share, 0) / points.length,
    highest,
    lowest,
  }
}

export interface RecurringRow {
  /** Il titolo come è scritto l'ultima volta che è comparso. */
  title: string
  category: string
  /** In quanti mesi diversi è comparsa. */
  months: number
  /** Quanto pesa in un mese: totale diviso i mesi in cui c'è stata. */
  perMonth: number
  total: number
  last: string
}

/**
 * Le spese fisse che tornano, raggruppate per titolo: è la risposta a «quanto mi
 * costa il mese base».
 *
 * Il raggruppamento è sul titolo ripulito, non sull'id: due mesi di affitto sono
 * due voci diverse nei dati e la stessa cosa nella vita. Il numero di mesi sta
 * nella riga proprio perché è la spia di un raggruppamento sbagliato: una voce
 * «fissa» comparsa una volta sola si vede subito.
 */
export function recurringProfile(
  scope: readonly Expense[],
  person: PersonId,
): { rows: RecurringRow[]; monthlyBase: number } {
  const map = new Map<
    string,
    { title: string; category: string; cents: number; months: Set<MonthKey>; last: string }
  >()
  for (const expense of scope) {
    if (!expense.recurring) continue
    const cents = toCents(shareOf(expense, person))
    if (cents === 0) continue
    const key = nameKey(expense.title)
    const row = map.get(key) ?? {
      title: expense.title.trim(),
      category: expense.category,
      cents: 0,
      months: new Set<MonthKey>(),
      last: expense.date,
    }
    row.cents += cents
    row.months.add(monthKeyOf(expense.date))
    /* Titolo e categoria dell'occorrenza più recente: se una voce è stata
       rinominata, il nome giusto è l'ultimo. */
    if (expense.date >= row.last) {
      row.last = expense.date
      row.title = expense.title.trim()
      row.category = expense.category
    }
    map.set(key, row)
  }
  const rows = [...map.values()]
    .map((row) => ({
      title: row.title,
      category: row.category,
      months: row.months.size,
      perMonth: round2(row.cents / row.months.size / 100),
      total: row.cents / 100,
      last: row.last,
    }))
    .sort((a, b) => b.perMonth - a.perMonth)
  return { rows, monthlyBase: sumBy(rows, (r) => r.perMonth) }
}

export function topExpenses(scope: readonly Expense[], person: PersonId, limit = 5): Expense[] {
  return [...scope].sort((a, b) => shareOf(b, person) - shareOf(a, person)).slice(0, limit)
}

// ─────────────────────────────── gatto ───────────────────────────────

/**
 * Statistiche di un sottoinsieme qualunque di spese: il gatto, il tricount di
 * casa, le spese di casa che stanno fuori da quel tricount. Il criterio con cui
 * si sceglie il sottoinsieme sta fuori — qui si conta soltanto.
 */
export interface SubsetStats {
  /** Quota della persona selezionata su tutta la storia. */
  share: number
  /** Costo complessivo per la coppia. */
  total: number
  monthlyAvgShare: number
  monthlyAvgTotal: number
  series: MonthTotal[]
  perPerson: Record<PersonId, number>
  count: number
  months: number
  firstDate?: string
  lastDate?: string
  /** Le spese in cui la persona ha una quota, dalla più recente. */
  expenses: Expense[]
}

export interface CatStats extends SubsetStats {
  subcategories: CategorySlice[]
}

export function subsetStats(scope: readonly Expense[], person: PersonId): SubsetStats {
  const mine = scope.filter((e) => toCents(shareOf(e, person)) > 0)
  const series = monthlySeries(mine, person)
  const months = fillMonthGaps(series).length
  const dates = scope.map((e) => e.date).sort()
  const share = totalShare(scope, person)
  const total = totalCouple(scope)
  return {
    share,
    total,
    monthlyAvgShare: months === 0 ? 0 : round2(share / months),
    monthlyAvgTotal: months === 0 ? 0 : round2(total / months),
    series,
    perPerson: { me: totalShare(scope, 'me'), partner: totalShare(scope, 'partner') },
    count: scope.length,
    months,
    firstDate: dates[0],
    lastDate: dates[dates.length - 1],
    expenses: [...mine].sort(byDateDesc),
  }
}

export function catStats(
  allExpenses: readonly Expense[],
  person: PersonId,
  catCategory: string,
): CatStats {
  const scope = allExpenses.filter((e) => e.category === catCategory)
  return {
    ...subsetStats(scope, person),
    subcategories: subcategoryBreakdown(scope, person, catCategory),
  }
}

/*
 * ─────────────────────────── la casa ───────────────────────────
 *
 * Il tricount «Spese Casa» e la categoria «casa» **non coincidono**, e la
 * pagina Casa mostra i due insiemi separati invece di far finta che siano uno.
 * Nel tricount ci sono 40 voci di telefonia e 6 di trasporti, che casa non
 * sono; e 58 voci di categoria casa stanno nell'altro tricount condiviso.
 * Fondere i due insiemi vorrebbe dire mentire su uno dei due.
 */

/** Il tricount di casa così com'è, telefonia e auto comprese. */
export function houseLedger(allExpenses: readonly Expense[], houseTricount: string): Expense[] {
  return allExpenses.filter((e) => e.tricount === houseTricount)
}

/** Spese di casa registrate altrove: stessa categoria, tricount diverso. */
export function houseOutside(
  allExpenses: readonly Expense[],
  houseTricount: string,
  houseCategory: string,
): Expense[] {
  return allExpenses.filter((e) => e.category === houseCategory && e.tricount !== houseTricount)
}

/*
 * ─────────────────── il saldo fra le due persone ───────────────────
 *
 * Il segno è **fisso**, non dipende da chi guarda: positivo = `partner` deve a
 * `me`. La pagina lo gira per chi sta guardando; il calcolo no, altrimenti due
 * viste dello stesso dato darebbero due verità.
 *
 * Tre trappole, tutte con un test che le presidia:
 *
 * 1. **Il welfare non si filtra.** `fundedByWelfare()` toglie la spesa dal
 *    *budget* di chi l'ha anticipata, ma la quota dell'altra persona è debito
 *    eccome: quella la rimborsa in contanti. Passare qui le spese già filtrate
 *    da `visibleFor()` perderebbe [cifra rimossa] di soli alberghi del Sud Italia.
 * 2. **Gli anticipi di terzi restano fuori.** Se ha pagato qualcuno del gruppo,
 *    il debito è verso di lui, non fra voi due: 32 spese, [cifra rimossa] di quote vostre.
 * 3. **Il saldo non tocca il margine.** Le spese contano già solo la propria
 *    quota, quindi quando il rimborso arriva il conto torna esattamente a quella:
 *    contarlo come entrata sarebbe contarlo due volte. → ADR-0019
 */

export interface BalanceMovement {
  id: string
  date: string
  title: string
  /** Quanto ha spostato il saldo: positivo = `partner` deve di più a `me`. */
  delta: number
  kind: 'expense' | 'settlement'
  /** Il tricount da cui viene: `condivise`, `vacanze/creta-2025`… */
  group: string
}

/**
 * Il saldo di **un** tricount.
 *
 * Tricount tiene un saldo per gruppo, e ci si salda un gruppo alla volta: la
 * vacanza in Sud Italia può essere pari mentre le spese di casa non lo sono. Un
 * numero solo per tutta la coppia non è confrontabile con niente di ciò che si
 * vede nell'app di partenza. → ADR-0022
 */
export interface BalanceGroup {
  /** `fisse` | `condivise` | `personali` | `vacanze/<idViaggio>` */
  key: string
  /** Positivo = `partner` deve a `me`. */
  balance: number
  opening: number
  since: string
  /**
   * false = questo tricount non ha un punto di partenza suo, quindi il numero
   * non è confrontabile con Tricount: è solo «cosa è successo dopo la data
   * generale». La pagina lo dice invece di far finta.
   */
  declared: boolean
  frontedByMe: number
  frontedByPartner: number
  movements: number
}

export interface CoupleBalance {
  /** Positivo = `partner` deve a `me`. Somma dei tricount più il residuo. */
  balance: number
  /** Un saldo per tricount, dal più mosso. */
  groups: BalanceGroup[]
  /** I tricount senza punto di partenza dichiarato: il totale è parziale. */
  undeclared: string[]
  /** Residuo non attribuibile a nessun tricount, dichiarato in configurazione. */
  opening: number
  since: string
  /** Quote di `partner` anticipate da `me`, dal punto di partenza in poi. */
  frontedByMe: number
  /** Quote di `me` anticipate da `partner`. */
  frontedByPartner: number
  /** Rimborsi registrati, in valore assoluto. */
  settled: number
  /** Quote vostre che ha anticipato qualcun altro: non sono un debito fra voi. */
  outsideCouple: number
  /** Cosa ha mosso il saldo, dal più recente. */
  movements: BalanceMovement[]
}

/** Da dove parte il saldo di un tricount. */
export interface BalanceStart {
  since: string
  opening: number
  note?: string
}

/**
 * La quota che l'altra persona deve per quella spesa. Zero se il conto l'ha
 * anticipato qualcuno fuori dalla coppia: non è un debito fra voi due.
 */
export function owedOf(expense: Expense): number {
  if (expense.paidBy === 'others') return 0
  return expense.paidBy === 'me' ? expense.shares.partner : expense.shares.me
}

/**
 * Quanto quella spesa sposta il saldo, col segno fisso del calcolo: positivo =
 * `partner` deve a `me`.
 *
 * Serve due volte, e la seconda è la ragione per cui è una funzione: spostare
 * una spesa da un tricount a un altro muove **questo** numero da un gruppo
 * all'altro, e il foglio lo dice prima di farlo.
 */
export function balanceDeltaOf(expense: Expense): number {
  const owed = owedOf(expense)
  /* Senza questo `-0` esce da qui e diventa «−0,00 €» a schermo, che è un segno
     meno davanti al niente. */
  if (toCents(owed) === 0) return 0
  return expense.paidBy === 'me' ? owed : -owed
}

interface Bucket {
  opening: number
  since: string
  declared: boolean
  frontedByMe: number
  frontedByPartner: number
  movements: number
  /**
   * Quante spese di quel tricount hanno una quota dell'altra persona, **da
   * sempre** — non solo dopo il punto di partenza. Serve a distinguere un
   * tricount che tace perché è a posto da uno che tace perché nessuno ha
   * dichiarato da dove parte: il secondo va detto, non omesso.
   */
  history: number
}

export function coupleBalance(
  allExpenses: readonly Expense[],
  settlements: readonly Settlement[],
  opts: { since: string; opening: number; groups?: Record<string, BalanceStart> },
): CoupleBalance {
  const movements: BalanceMovement[] = []
  const buckets = new Map<string, Bucket>()
  let settled = 0
  let outsideCouple = 0

  /**
   * Il punto di partenza di un tricount. Quello generale fa da data di ripiego,
   * ma **non presta il suo `opening`**: ereditarlo per gruppo lo conterebbe una
   * volta per tricount. Il residuo generale entra nel totale una volta sola.
   */
  const bucketOf = (key: string): Bucket => {
    const existing = buckets.get(key)
    if (existing) return existing
    const declared = opts.groups?.[key]
    const fresh: Bucket = {
      opening: declared ? toCents(declared.opening) : 0,
      since: declared ? declared.since : opts.since,
      declared: declared !== undefined,
      frontedByMe: 0,
      frontedByPartner: 0,
      movements: 0,
      history: 0,
    }
    buckets.set(key, fresh)
    return fresh
  }

  /* I tricount con un punto di partenza dichiarato esistono anche se dopo quella
     data non è successo niente: «pari e patta» è un'informazione. */
  for (const key of Object.keys(opts.groups ?? {})) bucketOf(key)

  for (const expense of allExpenses) {
    const key = expense.tricount
    const bucket = bucketOf(key)
    const owed = owedOf(expense)
    if (expense.paidBy !== 'others' && toCents(owed) !== 0) bucket.history += 1

    /* Il punto di partenza è compreso: quello che c'era fino a quel giorno sta
       già dentro l'`opening` di quel tricount. */
    if (expense.date <= bucket.since) continue

    if (expense.paidBy === 'others') {
      outsideCouple += toCents(expense.shares.me) + toCents(expense.shares.partner)
      continue
    }

    if (toCents(owed) === 0) continue

    const delta = expense.paidBy === 'me' ? toCents(owed) : -toCents(owed)
    if (expense.paidBy === 'me') bucket.frontedByMe += toCents(owed)
    else bucket.frontedByPartner += toCents(owed)
    bucket.movements += 1

    movements.push({
      id: expense.id,
      date: expense.date,
      title: expense.title,
      delta: delta / 100,
      kind: 'expense',
      group: key,
    })
  }

  let settlementDelta = 0
  for (const settlement of settlements) {
    /* Un rimborso non appartiene a un tricount: è denaro che passa di mano. Vale
       dalla data generale in poi, e sposta il totale, non un gruppo. */
    if (settlement.date <= opts.since) continue
    const cents = toCents(settlement.amount)
    settled += cents
    /* Se `partner` rimborsa `me`, il suo debito scende. */
    const delta = settlement.from === 'partner' ? -cents : cents
    settlementDelta += delta
    movements.push({
      id: settlement.id,
      date: settlement.date,
      title: settlement.note?.trim() || 'Rimborso',
      delta: delta / 100,
      kind: 'settlement',
      group: 'rimborsi',
    })
  }

  const groups: BalanceGroup[] = []
  let frontedByMe = 0
  let frontedByPartner = 0
  let groupTotal = 0
  for (const [key, bucket] of buckets) {
    const balance = bucket.opening + bucket.frontedByMe - bucket.frontedByPartner
    /*
     * Si tace solo di un tricount che **non ha mai** avuto una quota dell'altra
     * persona — le spese personali, per costruzione. Un tricount con una storia
     * ma senza punto di partenza dichiarato compare eccome, marcato: ometterlo
     * farebbe sembrare completo un totale che non lo è, e quattro vacanze vecchie
     * spariscono in silenzio portandosi via cinquecento euro.
     */
    if (!bucket.declared && bucket.history === 0) continue
    groupTotal += balance
    frontedByMe += bucket.frontedByMe
    frontedByPartner += bucket.frontedByPartner
    groups.push({
      key,
      balance: balance / 100,
      opening: bucket.opening / 100,
      since: bucket.since,
      declared: bucket.declared,
      frontedByMe: bucket.frontedByMe / 100,
      frontedByPartner: bucket.frontedByPartner / 100,
      movements: bucket.movements,
    })
  }

  const balance = toCents(opts.opening) + groupTotal + settlementDelta

  return {
    balance: balance / 100,
    groups: groups.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)),
    undeclared: groups.filter((g) => !g.declared).map((g) => g.key),
    opening: opts.opening,
    since: opts.since,
    frontedByMe: frontedByMe / 100,
    frontedByPartner: frontedByPartner / 100,
    settled: settled / 100,
    outsideCouple: outsideCouple / 100,
    movements: movements.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1)),
  }
}

// ─────────────────────────────── vacanze ───────────────────────────────

export interface TripStats {
  trip: Trip
  /** Costo complessivo del viaggio, quote di chi era con voi comprese. */
  total: number
  /** Quanto è costato a voi due. Coincide con `total` nei viaggi in coppia. */
  couple: number
  /** Quota di chi non siete voi due: > 0 solo nei viaggi di gruppo. */
  others: number
  /** Quanto del viaggio è stato pagato col welfare, e non con soldi vostri. */
  welfare: number
  /** Quota della persona selezionata. */
  share: number
  days: number
  /** Quota della persona al giorno. */
  perDayShare: number
  /** Quanto è costato a voi due, al giorno. */
  perDayCouple: number
  /** Composizione per sottocategoria: alloggio, trasporti, attività, cibo, souvenir. */
  parts: CategorySlice[]
  count: number
  expenses: Expense[]
}

export function tripStats(
  allExpenses: readonly Expense[],
  trips: readonly Trip[],
  person: PersonId,
): TripStats[] {
  return trips
    .map((trip) => {
      const scope = allExpenses.filter((e) => e.tricount === trip.id)
      const days = daysInclusive(trip.start, trip.end)
      const share = totalShare(scope, person)
      const total = totalAmount(scope)
      const couple = totalCouple(scope)
      /* Le voci in cui la persona non ha quota sono conti di altri passati per il
         tricount: pesano nel totale del gruppo, non nell'elenco che leggi. */
      const mine = scope.filter((e) => toCents(shareOf(e, person)) > 0).sort(byDateDesc)
      return {
        trip,
        total,
        couple,
        others: totalOthers(scope),
        welfare: sumBy(scope, welfareShare),
        share,
        days,
        perDayShare: round2(share / days),
        perDayCouple: round2(couple / days),
        parts: tripBreakdown(scope, person),
        count: mine.length,
        expenses: mine,
      }
    })
    .sort((a, b) => (a.trip.start < b.trip.start ? 1 : -1))
}

export interface TripYear {
  year: number
  trips: TripStats[]
  /** Fatturato dell'anno, quote di terzi comprese. */
  total: number
  /** Quanto è costato a voi due. */
  couple: number
  share: number
  days: number
}

export function tripsByYear(stats: readonly TripStats[]): TripYear[] {
  const map = new Map<number, TripStats[]>()
  for (const s of stats) {
    const bucket = map.get(s.trip.year)
    if (bucket) bucket.push(s)
    else map.set(s.trip.year, [s])
  }
  return [...map.entries()]
    .map(([year, trips]) => ({
      year,
      trips,
      total: sumBy(trips, (t) => t.total),
      couple: sumBy(trips, (t) => t.couple),
      share: sumBy(trips, (t) => t.share),
      days: trips.reduce((acc, t) => acc + t.days, 0),
    }))
    .sort((a, b) => b.year - a.year)
}

/** Luoghi visitati, con quante volte e quanto spesi in totale. */
export function tripPlaces(stats: readonly TripStats[]): { place: string; visits: number; share: number }[] {
  const map = new Map<string, { visits: number; share: number }>()
  for (const s of stats) {
    const cur = map.get(s.trip.place) ?? { visits: 0, share: 0 }
    map.set(s.trip.place, { visits: cur.visits + 1, share: cur.share + toCents(s.share) })
  }
  return [...map.entries()]
    .map(([place, v]) => ({ place, visits: v.visits, share: v.share / 100 }))
    .sort((a, b) => b.share - a.share)
}

// ─────────────────────────────── 730 ───────────────────────────────

export interface Tax730Year {
  year: number
  items: Expense[]
  /** Quota della persona: è quella che si porta in detrazione. */
  share: number
  total: number
  withReceipt: number
  missingReceipt: number
  withNotes: number
}

export function tax730ByYear(allExpenses: readonly Expense[], person: PersonId): Tax730Year[] {
  const tagged = allFor(allExpenses, person).filter((e) => e.tax730 === true)
  const map = new Map<number, Expense[]>()
  for (const e of tagged) {
    const y = yearOf(e.date)
    const bucket = map.get(y)
    if (bucket) bucket.push(e)
    else map.set(y, [e])
  }
  return [...map.entries()]
    .map(([year, items]) => {
      const sorted = items.sort(byDateDesc)
      const withReceipt = sorted.filter((e) => (e.receiptLinks?.length ?? 0) > 0).length
      return {
        year,
        items: sorted,
        share: totalShare(sorted, person),
        total: totalAmount(sorted),
        withReceipt,
        missingReceipt: sorted.length - withReceipt,
        withNotes: sorted.filter((e) => (e.notes ?? '').trim().length > 0).length,
      }
    })
    .sort((a, b) => b.year - a.year)
}

/**
 * Spese che assomigliano a una detraibile ma non sono taggate: la sezione 730
 * le propone, senza decidere per te.
 */
export function tax730Suggestions(
  allExpenses: readonly Expense[],
  person: PersonId,
  hints: readonly string[],
  year: number,
): Expense[] {
  /*
   * Un suggerimento va per categoria («salute») o per sottocategoria
   * («gatto/veterinario»): dentro la stessa categoria convivono spese detraibili
   * e spese che non lo sono — il veterinario sì, la lettiera no; le visite sì, il
   * barbiere no. Senza il livello fine la lista da controllare diventa rumore.
   */
  const hintSet = new Set(hints)
  const matches = (e: Expense): boolean =>
    hintSet.has(e.category) ||
    (e.subcategory !== undefined && hintSet.has(`${e.category}/${e.subcategory}`))
  return allFor(allExpenses, person)
    .filter((e) => yearOf(e.date) === year && e.tax730 !== true && matches(e))
    .sort(byDateDesc)
}

// ─────────────────────────────── filtri (pagina Spese) ───────────────────────────────

export interface ExpenseFilter {
  query: string
  month: MonthKey | 'all'
  /**
   * Estremi dell'intervallo, ISO `YYYY-MM-DD`, stringa vuota = estremo assente.
   *
   * Le date delle spese sono ISO, quindi il confronto fra stringhe **è** il
   * confronto fra date: nessun `Date` da costruire, nessun fuso da sbagliare.
   * I due estremi sono inclusivi e indipendenti — «dal 3 marzo in poi» è un
   * intervallo legittimo tanto quanto «fino al 12 aprile».
   *
   * Vive sullo stesso asse di `month`, e i due si spengono a vicenda in
   * `Spese.tsx`: qui non c'è una regola che li combini, perché non ci sono mai
   * tutti e due insieme. → ADR-0050
   */
  from: string
  to: string
  category: string | 'all'
  tricount: string | 'all'
  paidBy: PersonId | 'all'
  tax730Only: boolean
}

export const EMPTY_FILTER: ExpenseFilter = {
  query: '',
  month: 'all',
  from: '',
  to: '',
  category: 'all',
  tricount: 'all',
  paidBy: 'all',
  tax730Only: false,
}

export type SortKey = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'

export function applyFilter(scope: readonly Expense[], filter: ExpenseFilter): Expense[] {
  const q = filter.query.trim().toLowerCase()
  return scope.filter((e) => {
    if (filter.month !== 'all' && monthKeyOf(e.date) !== filter.month) return false
    /* Estremi inclusivi, confronto lessicografico su ISO. */
    if (filter.from !== '' && e.date < filter.from) return false
    if (filter.to !== '' && e.date > filter.to) return false
    if (filter.category !== 'all' && e.category !== filter.category) return false
    if (filter.tricount !== 'all' && e.tricount !== filter.tricount) return false
    if (filter.paidBy !== 'all' && e.paidBy !== filter.paidBy) return false
    if (filter.tax730Only && e.tax730 !== true) return false
    if (q.length > 0) {
      const haystack = `${e.title} ${e.notes ?? ''} ${e.category} ${e.subcategory ?? ''}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
}

export function sortExpenses(list: readonly Expense[], key: SortKey, person: PersonId): Expense[] {
  const out = [...list]
  switch (key) {
    case 'date-desc':
      return out.sort(byDateDesc)
    case 'date-asc':
      return out.sort((a, b) => -byDateDesc(a, b))
    case 'amount-desc':
      return out.sort((a, b) => shareOf(b, person) - shareOf(a, person))
    case 'amount-asc':
      return out.sort((a, b) => shareOf(a, person) - shareOf(b, person))
  }
}
