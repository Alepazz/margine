/**
 * Aggiunge un viaggio all'archivio, coordinate comprese.
 *
 *     node scripts/add-trip.mjs [--dry]
 *
 * Serve perché una vacanza si apre dall'app ma **senza coordinate**: nessuno
 * digita una latitudine col pollice, e quella scelta resta buona (→ ADR-0020).
 * Quando un viaggio deve comparire sul mappamondo, le coordinate arrivano da
 * qui.
 *
 * Il caso del giorno è New York, aprile 2024: un viaggio più vecchio dei
 * tricount, che partono da ottobre 2024. Non ha spese e non le avrà — sul
 * mappamondo c'è, nei conti no.
 *
 * La regola che rende la modifica verificabile: **le spese non si toccano**.
 * Questo script aggiunge una riga a `trips` e nient'altro; se l'elenco delle
 * spese cambia anche di un carattere, non scrive. È la stessa idea del totale
 * invariato in `migrate-taxonomy.mjs`: una modifica ai dati deve avere una
 * grandezza che dimostra che ha fatto solo quello che diceva.
 */

import { PATHS, log, readJson, writeJson } from './lib/io.mjs'

/**
 * Il viaggio da aggiungere. Le date sono quelle riferite da Alessio
 * (17–28 aprile 2024); le coordinate sono quelle di Manhattan, esatte e non
 * approssimate — «New York» è una città, non una regione.
 */
const TRIP = {
  id: 'new-york-2024',
  name: 'New York',
  place: 'New York',
  country: 'Stati Uniti',
  year: 2024,
  start: '2024-04-17',
  end: '2024-04-28',
  coords: { lat: 40.71, lon: -74.01 },
  emoji: '🇺🇸',
  /*
   * Conclusa: è del 2024, e un viaggio aperto resta per sempre nel menù in cui
   * si scegli dove mettere una spesa. Non tocca il saldo — «conclusa» non è
   * «saldata» — e si riapre dalla pagina Vacanze. → ADR-0027
   */
  closed: true,
}

function main() {
  const dry = process.argv.includes('--dry')
  const dataset = readJson(PATHS.expenses)
  const problems = []

  for (const field of ['id', 'name', 'place', 'start', 'end']) {
    if (!TRIP[field]) problems.push(`manca «${field}»`)
  }
  if (dataset.trips.some((trip) => trip.id === TRIP.id)) {
    problems.push(`il viaggio «${TRIP.id}» esiste già: non lo sovrascrivo`)
  }
  if (TRIP.end < TRIP.start) problems.push('finisce prima di cominciare')
  if (TRIP.year !== Number(TRIP.start.slice(0, 4))) {
    problems.push(`l'anno (${TRIP.year}) non coincide con la data di partenza (${TRIP.start})`)
  }

  const trips = [...dataset.trips, TRIP]
  const next = { ...dataset, trips, updatedAt: new Date().toISOString() }

  /* La garanzia: le spese sono le stesse, carattere per carattere. */
  if (JSON.stringify(next.expenses) !== JSON.stringify(dataset.expenses)) {
    problems.push('l’elenco delle spese è cambiato: questo script non deve toccarlo')
  }

  log(`Viaggi: ${dataset.trips.length} → ${trips.length}`)
  log(
    `  ${TRIP.emoji ?? ''} ${TRIP.name} · ${TRIP.place} · ${TRIP.start} → ${TRIP.end}` +
      ` · ${TRIP.coords.lat}, ${TRIP.coords.lon}${TRIP.closed ? ' · conclusa' : ''}`,
  )
  log(`Spese: ${dataset.expenses.length}, invariate`)

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

  writeJson(PATHS.expenses, next)
  log('\n✓ data/expenses.json aggiornato.')
  log('  Ora: npm run validate, poi npm run encrypt.')
}

main()
