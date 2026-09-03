/** Calendario in italiano, senza dipendenze e senza fusi orari: tutto su stringhe ISO. */

/** Chiave mese, `YYYY-MM`. */
export type MonthKey = string

const MONTHS_LONG = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
]

const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

/**
 * Vero se è un istante ISO completo, del genere che scrive `toISOString()`.
 *
 * Serve dove un giorno non basta: la lista della spesa ordina lo storico per
 * quando una cosa è stata presa, e dieci cose prese nello stesso pomeriggio
 * finirebbero in un ordine qualsiasi. Si controlla la **forma** e poi che
 * l'istante esista davvero, come fa `isRealDate` per i giorni: `2026-02-30T…`
 * supera una regex e non è mai esistito.
 */
export function isIsoDateTime(value: unknown): boolean {
  if (typeof value !== 'string') return false
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)) return false
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return false
  /* Il giro completo: `Date` perdona `2026-02-30` scivolando al primo marzo, e
     una data che si trasforma in un'altra non è una data valida. */
  return parsed.toISOString().slice(0, 19) === value.slice(0, 19)
}

export function monthKeyOf(isoDate: string): MonthKey {
  return isoDate.slice(0, 7)
}

export function yearOf(isoDate: string): number {
  return Number(isoDate.slice(0, 4))
}

export function dayOf(isoDate: string): number {
  return Number(isoDate.slice(8, 10))
}

export function parseMonthKey(month: MonthKey): { year: number; month: number } {
  return { year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)) }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** `2026-07` → `Luglio 2026`. */
export function monthLabel(month: MonthKey): string {
  const { year, month: m } = parseMonthKey(month)
  return `${capitalize(MONTHS_LONG[m - 1] ?? '?')} ${year}`
}

/**
 * `2026-07` → `luglio`, senza l'anno: per le frasi in cui l'anno è rumore.
 *
 * «di cui 320 € di mutuo di settembre 2026» si legge come un modulo; «di
 * settembre» come una frase. L'anno non serve, perché quel numero parla sempre
 * del mese in corso. → ADR-0081
 */
export function monthNameOf(month: MonthKey): string {
  const { month: m } = parseMonthKey(month)
  return MONTHS_LONG[m - 1] ?? '?'
}

/** `2026-07` → `lug 26`, per gli assi dei grafici. */
export function monthLabelShort(month: MonthKey): string {
  const { year, month: m } = parseMonthKey(month)
  return `${MONTHS_SHORT[m - 1] ?? '?'} ${String(year).slice(2)}`
}

/** `2026-07-14` → `14 lug 2026`. */
export function formatDate(isoDate: string): string {
  const { month: m } = parseMonthKey(monthKeyOf(isoDate))
  return `${dayOf(isoDate)} ${MONTHS_SHORT[m - 1] ?? '?'} ${yearOf(isoDate)}`
}

const WEEKDAYS_LONG = [
  'domenica',
  'lunedì',
  'martedì',
  'mercoledì',
  'giovedì',
  'venerdì',
  'sabato',
]

/** Il giorno ISO spostato di `delta` giorni: `addDays('2026-03-01', -1)` è `2026-02-28`. */
export function addDays(isoDate: string, delta: number): string {
  const { month } = parseMonthKey(monthKeyOf(isoDate))
  return new Date(Date.UTC(yearOf(isoDate), month - 1, dayOf(isoDate) + delta))
    .toISOString()
    .slice(0, 10)
}

/**
 * L'intestazione di un giorno in un elenco: «Oggi», «Ieri», «Domani», oppure
 * «Lunedì 31 agosto 2026».
 *
 * L'anno c'è sempre nella forma lunga, e non è ridondanza: nella pagina Spese si
 * scorre indietro di due anni, e «lunedì 31 agosto» senza anno è ambiguo appena
 * i dati coprono più di un agosto. → ADR-0077
 */
export function dayHeading(isoDate: string, today: string): string {
  if (isoDate === today) return 'Oggi'
  if (isoDate === addDays(today, -1)) return 'Ieri'
  if (isoDate === addDays(today, 1)) return 'Domani'
  const { month } = parseMonthKey(monthKeyOf(isoDate))
  const weekday = new Date(Date.UTC(yearOf(isoDate), month - 1, dayOf(isoDate))).getUTCDay()
  return capitalize(
    `${WEEKDAYS_LONG[weekday] ?? '?'} ${dayOf(isoDate)} ${MONTHS_LONG[month - 1] ?? '?'} ${yearOf(isoDate)}`,
  )
}

export function addMonths(month: MonthKey, delta: number): MonthKey {
  const { year, month: m } = parseMonthKey(month)
  const total = year * 12 + (m - 1) + delta
  const y = Math.floor(total / 12)
  const mm = (total % 12) + 1
  return `${y}-${String(mm).padStart(2, '0')}`
}

export function monthsBetween(from: MonthKey, to: MonthKey): number {
  const a = parseMonthKey(from)
  const b = parseMonthKey(to)
  return (b.year - a.year) * 12 + (b.month - a.month)
}

export function daysInMonth(month: MonthKey): number {
  const { year, month: m } = parseMonthKey(month)
  return new Date(Date.UTC(year, m, 0)).getUTCDate()
}

/** Elenco contiguo di mesi, estremi inclusi. */
export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = []
  const span = monthsBetween(from, to)
  for (let i = 0; i <= span; i++) out.push(addMonths(from, i))
  return out
}

/** Data odierna come `YYYY-MM-DD`, nel fuso locale. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function currentMonthKey(now: Date = new Date()): MonthKey {
  return monthKeyOf(todayIso(now))
}

/** Giorni di viaggio, estremi inclusi: dal 3 al 5 sono tre giorni. */
export function daysInclusive(startIso: string, endIso: string): number {
  const start = Date.UTC(yearOf(startIso), parseMonthKey(monthKeyOf(startIso)).month - 1, dayOf(startIso))
  const end = Date.UTC(yearOf(endIso), parseMonthKey(monthKeyOf(endIso)).month - 1, dayOf(endIso))
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1)
}

/**
 * Quanti giorni di quel mese sono passati (1-based: il primo del mese fa 1).
 *
 * Un mese **futuro** non ne ha nessuno, e prima diceva il contrario: la
 * condizione era «se non è il mese corrente, è tutto trascorso», che è vera per
 * il passato e falsa per il futuro. Bastava una spesa datata avanti — un refuso
 * sulla data, o l'affitto del mese prossimo inserito presto — perché la scheda
 * di quel mese dicesse «mese chiuso, il numero è definitivo» di un mese non
 * ancora cominciato. È la stessa famiglia di ADR-0055. → ADR-0063
 */
export function elapsedDaysInMonth(month: MonthKey, today: string): number {
  const corrente = monthKeyOf(today)
  if (month > corrente) return 0
  if (month < corrente) return daysInMonth(month)
  return Math.min(dayOf(today), daysInMonth(month))
}
