/**
 * Divisione degli importi per gli script.
 *
 * È la stessa regola di `src/domain/money.ts` (l'app è TypeScript, gli script
 * JavaScript, e non possono importarsi a vicenda): le due metà sommano sempre
 * esattamente all'originale e il centesimo dispari va a chi ha pagato. Se le due
 * copie divergessero, la riconciliazione con Tricount si romperebbe in silenzio,
 * quindi la regola sta scritta in un posto solo per lato.
 */

export function toCents(euro) {
  return Math.round(euro * 100)
}

/** Quote per una spesa divisa a metà, con il centesimo dispari a chi ha pagato. */
export function halfShares(amount, paidBy = 'me') {
  const cents = toCents(amount)
  const first = Math.ceil(cents / 2)
  const second = cents - first
  return paidBy === 'partner'
    ? { me: second / 100, partner: first / 100 }
    : { me: first / 100, partner: second / 100 }
}

/**
 * Quote secondo la ripartizione dichiarata:
 * `half` (default), `me` o `partner` per una spesa interamente di uno dei due.
 */
export function sharesFor(amount, split = 'half', paidBy = 'me') {
  const cents = toCents(amount)
  if (split === 'me') return { me: cents / 100, partner: 0 }
  if (split === 'partner') return { me: 0, partner: cents / 100 }
  return halfShares(amount, paidBy)
}
