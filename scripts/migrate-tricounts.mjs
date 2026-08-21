/**
 * Migrazione al modello a tricount con membri (21/08/2026). → ADR-0037
 *
 *     node scripts/migrate-tricounts.mjs [--dry]
 *
 * Cosa cambia:
 * - `Expense.source` + `Expense.trip` diventano **un campo solo**, `tricount`;
 * - `dataset.trips` e `config.sources` confluiscono in `dataset.tricounts`,
 *   dove ogni tricount dichiara **i suoi membri**;
 * - «personali» si spacca in due compartimenti, uno per persona: quello di
 *   Federica nasce adesso, vuoto;
 * - le chiavi di `config.balance.groups` perdono il prefisso `vacanze/`;
 * - `config.houseSource` diventa `config.houseTricount`.
 *
 * Le regole che rendono la migrazione verificabile — se una non torna, non si
 * scrive niente:
 * 1. il **totale generale** non cambia di un centesimo;
 * 2. il **conteggio per tricount** coincide col conteggio per origine di prima;
 * 3. il **saldo fra le due persone** — totale e per gruppo — è identico,
 *    ricalcolato prima e dopo con la stessa formula di `coupleBalance`;
 * 4. i dati migrati passano `validate-core` senza errori.
 */

import { PATHS, log, readJson, writeJson } from './lib/io.mjs'
import { validateDataset } from './lib/validate-core.mjs'

const cents = (value) => Math.round(value * 100)

/** I nomi dei due compartimenti personali: come su Tricount, riferiti da Alessio. */
const PERSONAL = {
  alessio: { id: 'personali-alessio', member: 'me' },
  federica: { id: 'personali-federica', member: 'partner', name: 'Personale', emoji: '🤦🏼‍♀️' },
}

/** Da (source, trip) all'id del tricount nuovo. */
function tricountOf(expense) {
  if (expense.source === 'vacanze') return expense.trip
  if (expense.source === 'personali') return PERSONAL.alessio.id
  return expense.source
}

/**
 * Il saldo, con la stessa aritmetica di `coupleBalance`: per bucket, con i punti
 * di partenza dichiarati, in centesimi. `keyOf` è l'unica cosa che cambia fra
 * prima e dopo — è esattamente il pezzo che la migrazione tocca.
 */
function balanceOf(expenses, balance, keyOf) {
  const buckets = new Map()
  const bucketOf = (key) => {
    if (!buckets.has(key)) {
      const declared = balance.groups?.[key]
      buckets.set(key, {
        opening: declared ? cents(declared.opening) : 0,
        since: declared ? declared.since : balance.since,
        value: declared ? cents(declared.opening) : 0,
        history: 0,
        declared: declared !== undefined,
      })
    }
    return buckets.get(key)
  }
  for (const key of Object.keys(balance.groups ?? {})) bucketOf(key)

  for (const expense of expenses) {
    if (expense.paidBy === 'others') continue
    const owed = expense.paidBy === 'me' ? expense.shares.partner : expense.shares.me
    if (cents(owed) === 0) continue
    const bucket = bucketOf(keyOf(expense))
    bucket.history += 1
    if (expense.date <= bucket.since) continue
    bucket.value += expense.paidBy === 'me' ? cents(owed) : -cents(owed)
  }

  let total = cents(balance.opening)
  const perBucket = new Map()
  for (const [key, bucket] of buckets) {
    if (!bucket.declared && bucket.history === 0) continue
    total += bucket.value
    perBucket.set(key, bucket.value)
  }
  return { total, perBucket }
}

function main() {
  const dry = process.argv.includes('--dry')
  const dataset = readJson(PATHS.expenses)
  const config = readJson(PATHS.config)
  const problems = []

  if (Array.isArray(dataset.tricounts)) {
    log('✗ I dati sono già al modello a tricount: niente da migrare.')
    process.exitCode = 1
    return
  }

  // ── I tricount nuovi ──
  const sources = config.sources ?? {}
  const both = ['me', 'partner']
  const named = (key, fallback) => ({
    name: sources[key]?.name ?? fallback,
    ...(sources[key]?.emoji ? { emoji: sources[key].emoji } : {}),
  })

  const tricounts = [
    { id: 'condivise', ...named('condivise', 'Spese condivise'), members: both },
    { id: PERSONAL.alessio.id, ...named('personali', 'Personale'), members: [PERSONAL.alessio.member] },
    /* Il compartimento di Federica: nasce vuoto, si riempie col suo import. */
    {
      id: PERSONAL.federica.id,
      name: PERSONAL.federica.name,
      emoji: PERSONAL.federica.emoji,
      members: [PERSONAL.federica.member],
    },
    { id: 'fisse', ...named('fisse', 'Spese fisse condivise'), members: both },
    ...dataset.trips.map((trip) => ({
      id: trip.id,
      name: trip.name,
      ...(trip.emoji ? { emoji: trip.emoji } : {}),
      members: both,
      ...(trip.closed ? { closed: true } : {}),
      trip: {
        place: trip.place,
        ...(trip.country ? { country: trip.country } : {}),
        year: trip.year,
        start: trip.start,
        end: trip.end,
        ...(trip.coords ? { coords: trip.coords } : {}),
      },
    })),
  ]

  // ── Le spese ──
  const expenses = dataset.expenses.map((expense) => {
    const target = tricountOf(expense)
    if (!target) {
      problems.push(`${expense.id}: spesa di vacanza senza viaggio, non so dove metterla.`)
      return expense
    }
    const { source: _s, trip: _t, ...rest } = expense
    /* Il campo nuovo al posto dei due vecchi, nella stessa posizione: il diff
       del JSON resta leggibile. */
    return { ...rest, tricount: target }
  })

  // ── La configurazione ──
  const groups = Object.fromEntries(
    Object.entries(config.balance.groups ?? {}).map(([key, value]) => [
      key.startsWith('vacanze/') ? key.slice('vacanze/'.length) : key,
      value,
    ]),
  )
  const { sources: _sources, houseSource, ...restConfig } = config
  const nextConfig = {
    ...restConfig,
    version: 2,
    houseTricount: houseSource,
    balance: { ...config.balance, groups },
  }
  const nextDataset = {
    ...dataset,
    version: 2,
    updatedAt: new Date().toISOString(),
    expenses,
    tricounts,
    settlements: dataset.settlements ?? [],
  }
  delete nextDataset.trips

  // ── Guardia 1: il totale generale, al centesimo ──
  const totalBefore = dataset.expenses.reduce((sum, e) => sum + cents(e.amount), 0)
  const totalAfter = expenses.reduce((sum, e) => sum + cents(e.amount), 0)
  if (totalBefore !== totalAfter) {
    problems.push(`Totale cambiato: ${totalBefore} → ${totalAfter} centesimi.`)
  }

  // ── Guardia 2: il conteggio per tricount coincide con quello per origine ──
  const countBefore = new Map()
  for (const e of dataset.expenses) {
    const key = tricountOf(e)
    countBefore.set(key, (countBefore.get(key) ?? 0) + 1)
  }
  const countAfter = new Map()
  for (const e of expenses) countAfter.set(e.tricount, (countAfter.get(e.tricount) ?? 0) + 1)
  for (const [key, count] of countBefore) {
    if (countAfter.get(key) !== count) {
      problems.push(`Tricount ${key}: ${count} voci prima, ${countAfter.get(key) ?? 0} dopo.`)
    }
  }

  // ── Guardia 3: il saldo, totale e per gruppo ──
  const before = balanceOf(dataset.expenses, config.balance, (e) =>
    e.source === 'vacanze' && e.trip ? `vacanze/${e.trip}` : e.source,
  )
  const after = balanceOf(expenses, nextConfig.balance, (e) => e.tricount)
  if (before.total !== after.total) {
    problems.push(`Saldo cambiato: ${before.total} → ${after.total} centesimi.`)
  }
  for (const [key, value] of before.perBucket) {
    const mapped =
      key.startsWith('vacanze/') ? key.slice('vacanze/'.length) : key === 'personali' ? PERSONAL.alessio.id : key
    if (after.perBucket.get(mapped) !== value) {
      problems.push(`Saldo del gruppo ${key}: ${value} → ${after.perBucket.get(mapped)} centesimi.`)
    }
  }

  // ── Guardia 4: la validazione intera ──
  const { errors } = validateDataset(nextDataset, nextConfig)
  for (const error of errors.slice(0, 10)) problems.push(`validate: ${error}`)

  log(`Spese: ${expenses.length} · tricount: ${tricounts.length} (di cui ${dataset.trips.length} viaggi)`)
  log('Voci per tricount:')
  for (const [key, count] of [...countAfter.entries()].sort((a, b) => b[1] - a[1])) {
    log(`  ${String(count).padStart(5)}  ${key}`)
  }
  log(`Totale generale invariato: ${(totalBefore / 100).toFixed(2)} €`)
  log(`Saldo invariato: ${(before.total / 100).toFixed(2)} €`)

  if (problems.length > 0) {
    log(`\n✗ ${problems.length} problemi, non scrivo niente:`)
    for (const problem of problems.slice(0, 20)) log(`  - ${problem}`)
    process.exitCode = 1
    return
  }

  if (dry) {
    log('\n(--dry: nessun file scritto)')
    return
  }

  writeJson(PATHS.expenses, nextDataset)
  writeJson(PATHS.config, nextConfig)
  log('\n✓ data/expenses.json e data/config.json migrati al modello a tricount.')
  log('  Ora: npm run validate, poi npm run encrypt.')
}

main()
