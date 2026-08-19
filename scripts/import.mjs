/**
 * Import mensile: fonde i file preparati in `data/incoming/` nel master,
 * valida, e ripubblica i file cifrati.
 *
 * Un file di incoming è un JSON con `{ "expenses": [...], "trips": [...] }`
 * (o direttamente un array di spese). Le voci senza `id` ne ricevono uno
 * deterministico, ricavato da data, titolo e importo: rilanciare l'import sullo
 * stesso file non crea doppioni, e le annotazioni 730 restano attaccate alla
 * spesa giusta.
 */

import { readdirSync } from 'node:fs'
import { join } from 'node:path'

import { PATHS, exists, fail, log, readJson, writeJson } from './lib/io.mjs'
import { sharesFor } from './lib/money.mjs'
import { publish } from './lib/publish.mjs'

function hash8(text) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function idFor(expense) {
  return `${expense.date}-${hash8(`${expense.title}|${expense.amount}|${expense.source}`)}`
}

/** Le quote si possono omettere: `split: "half" | "me" | "partner"` basta. */
function withShares(expense) {
  if (expense.shares) return expense
  const split = expense.split ?? (expense.source === 'personali' ? 'me' : 'half')
  const paidBy = expense.paidBy ?? 'me'
  const { split: _ignored, ...rest } = expense
  return { ...rest, paidBy, shares: sharesFor(expense.amount, split, paidBy) }
}

try {
  if (!exists(PATHS.incoming)) {
    log(`Nessuna cartella ${PATHS.incoming}: crea data/incoming/ e mettici i file del mese.`)
    process.exitCode = 1
  } else {
    const files = readdirSync(PATHS.incoming)
      .filter((name) => name.endsWith('.json'))
      .sort()

    if (files.length === 0) {
      log('Nessun file .json in data/incoming/: niente da importare.')
    } else {
      const master = exists(PATHS.expenses)
        ? readJson(PATHS.expenses)
        : { version: 1, updatedAt: new Date().toISOString(), expenses: [], trips: [] }

      const byId = new Map(master.expenses.map((expense) => [expense.id, expense]))
      const tripsById = new Map(master.trips.map((trip) => [trip.id, trip]))

      let added = 0
      let skipped = 0
      let tripsAdded = 0

      for (const name of files) {
        const raw = readJson(join(PATHS.incoming, name))
        const incomingExpenses = Array.isArray(raw) ? raw : (raw.expenses ?? [])
        const incomingTrips = Array.isArray(raw) ? [] : (raw.trips ?? [])

        for (const trip of incomingTrips) {
          if (!tripsById.has(trip.id)) {
            tripsById.set(trip.id, trip)
            tripsAdded += 1
          }
        }

        for (const entry of incomingExpenses) {
          const expense = withShares(entry)
          const id = expense.id ?? idFor(expense)
          if (byId.has(id)) {
            skipped += 1
            continue
          }
          byId.set(id, { ...expense, id })
          added += 1
        }

        log(`· ${name}: ${incomingExpenses.length} voci, ${incomingTrips.length} viaggi`)
      }

      const merged = {
        version: 1,
        updatedAt: new Date().toISOString(),
        expenses: [...byId.values()].sort((a, b) =>
          a.date === b.date ? String(a.id).localeCompare(String(b.id)) : a.date < b.date ? -1 : 1,
        ),
        trips: [...tripsById.values()].sort((a, b) => (a.start < b.start ? -1 : 1)),
      }

      log('')
      log(`Aggiunte ${added} spese, ${tripsAdded} viaggi. Già presenti (saltate): ${skipped}.`)
      log(`Master: ${merged.expenses.length} spese, ${merged.trips.length} viaggi.`)

      writeJson(PATHS.expenses, merged)

      const result = await publish()
      if (!result.ok) {
        fail('Import scritto in data/expenses.json ma non pubblicato: correggi gli errori e lancia npm run encrypt.')
      }
    }
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
