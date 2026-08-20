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

/**
 * Ripulisce quello che si sta scrivendo in un campo importo, mentre lo si scrive.
 *
 * Il campo delle spese resta `type="text"` con `inputMode="decimal"` e non
 * `type="number"`: su iOS il tipo numerico porta con sé le frecette e litiga con
 * la virgola, mentre `inputMode` apre il tastierino e lascia a noi il controllo
 * della stringa. Il controllo è questo, e vale tre cose:
 *
 * - via tutto ciò che non è una cifra o un separatore, così nel campo non entra
 *   una lettera nemmeno incollandola;
 * - **un solo** separatore, il primo, e diventa una virgola: chi scrive `12.5`
 *   sulla tastiera del Mac vede `12,5`, che è come si scrive un importo qui;
 * - due decimali, non tre: i centesimi sono l'unità di questo progetto.
 */
export function sanitizeAmount(text: string): string {
  const cleaned = text.replace(/[^\d.,]/g, '')
  const separator = cleaned.search(/[.,]/)
  if (separator < 0) return cleaned
  const whole = cleaned.slice(0, separator)
  const decimals = cleaned.slice(separator + 1).replace(/[.,]/g, '')
  return `${whole},${decimals.slice(0, 2)}`
}
