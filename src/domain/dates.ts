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
