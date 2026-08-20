/**
 * Emoji dei tricount e dei viaggi, riferite da Alessio il 20/08/2026.
 *
 *     node scripts/set-emoji.mjs [--dry]
 *
 * Sta in uno script e non in una modifica a mano perché tocca due file — la
 * configurazione (i tre tricount fissi) e il dataset (i viaggi) — e perché
 * un'emoji messa su un id sbagliato è invisibile: non rompe niente, semplicemente
 * non compare. Quindi ogni riga si verifica contro quello che esiste, e se un id
 * non c'è lo script non scrive.
 *
 * I nomi e le emoji **sono dati**, non codice: se questo file finisse per
 * contenere anche i nomi dei tricount, quelli sarebbero nel repo pubblico. Qui
 * ci sono solo le emoji, che sono innocue, e servono a una migrazione una volta
 * sola. → ADR-0026
 */

import { PATHS, log, readJson, writeJson } from './lib/io.mjs'

/** Emoji per tricount fisso. Le chiavi sono le quattro origini del modello. */
const SOURCES = {
  condivise: '🥺',
  personali: '🤦🏼‍♂️',
  fisse: '🏡',
  vacanze: '🧳',
}

/** Emoji per viaggio, per id. */
const TRIPS = {
  'sud-italia-2026': '🇮🇹',
  'creta-2025': '🏝️',
  'ortona-2025': '🇮🇹',
  'parigi-2025': '🇫🇷',
  'germania-2024': '🇩🇪',
}

function main() {
  const dry = process.argv.includes('--dry')
  const config = readJson(PATHS.config)
  const dataset = readJson(PATHS.expenses)
  const problems = []

  /*
   * `sources` sostituisce il vecchio `sourceLabels`, che era una mappa di
   * stringhe: il nome resta quello che c'era, l'emoji si aggiunge accanto.
   */
  const previous = config.sources ?? config.sourceLabels ?? {}
  const sources = {}
  for (const [key, emoji] of Object.entries(SOURCES)) {
    const before = previous[key]
    const name = typeof before === 'string' ? before : before?.name
    if (!name) {
      problems.push(`il tricount «${key}» non ha un nome in config: mettilo prima di dargli un'emoji`)
      continue
    }
    sources[key] = { name, emoji }
    log(`  ${emoji}  ${key.padEnd(11)} ${name}`)
  }

  const known = new Set(dataset.trips.map((trip) => trip.id))
  for (const id of Object.keys(TRIPS)) {
    if (!known.has(id)) problems.push(`il viaggio «${id}» non esiste: emoji su un id sbagliato`)
  }
  const trips = dataset.trips.map((trip) => {
    const emoji = TRIPS[trip.id]
    if (!emoji) return trip
    log(`  ${emoji}  ${trip.id.padEnd(18)} ${trip.name}`)
    return { ...trip, emoji }
  })

  if (problems.length > 0) {
    log(`\n✗ ${problems.length} problemi, non scrivo niente:`)
    for (const problem of problems) log(`  - ${problem}`)
    process.exitCode = 1
    return
  }

  if (dry) {
    log('\n(--dry: nessun file scritto)')
    return
  }

  const nextConfig = { ...config, sources }
  delete nextConfig.sourceLabels
  writeJson(PATHS.config, nextConfig)
  writeJson(PATHS.expenses, { ...dataset, trips, updatedAt: new Date().toISOString() })
  log('\n✓ data/config.json e data/expenses.json aggiornati.')
  log('  Ora: npm run validate, poi npm run encrypt.')
}

main()
