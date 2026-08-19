/**
 * Aritmetica del denaro.
 *
 * Gli importi stanno in euro nel JSON (leggibili durante l'import), ma ogni
 * somma passa per i centesimi interi: sommare 0.1 + 0.2 in virgola mobile
 * produce 0.30000000000000004, e su qualche centinaio di spese l'errore
 * diventa visibile nel confronto con i totali di Tricount.
 */

export function toCents(euro: number): number {
  return Math.round(euro * 100)
}

export function fromCents(cents: number): number {
  return cents / 100
}

/** Somma esatta di importi in euro. */
export function sumEuro(values: readonly number[]): number {
  let cents = 0
  for (const v of values) cents += toCents(v)
  return fromCents(cents)
}

export function sumBy<T>(items: readonly T[], pick: (item: T) => number): number {
  let cents = 0
  for (const item of items) cents += toCents(pick(item))
  return fromCents(cents)
}

export function round2(n: number): number {
  return fromCents(toCents(n))
}

/**
 * Divide un importo in due metà che sommano esattamente all'originale.
 * Il centesimo dispari va alla prima metà (per convenzione: a chi ha pagato).
 */
export function splitHalf(amount: number): [number, number] {
  const cents = toCents(amount)
  const first = Math.ceil(cents / 2)
  return [fromCents(first), fromCents(cents - first)]
}

const EURO = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const EURO_ROUND = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const NUM_1 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function formatEuro(n: number, opts: { decimals?: 0 | 2 } = {}): string {
  return opts.decimals === 0 ? EURO_ROUND.format(n) : EURO.format(n)
}

/** Forma compatta per gli assi dei grafici: `1,2k €`. */
export function formatEuroCompact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1000) return `${NUM_1.format(n / 1000)}k`
  return String(Math.round(n))
}

export function formatPct(fraction: number, opts: { decimals?: 0 | 1 } = {}): string {
  const { decimals = 0 } = opts
  const pct = fraction * 100
  const value = decimals === 1 ? NUM_1.format(pct) : String(Math.round(pct))
  return `${value}%`
}

/** Variazione relativa fra due valori; `null` quando la base è zero. */
export function relativeChange(current: number, base: number): number | null {
  if (toCents(base) === 0) return null
  return (current - base) / base
}
