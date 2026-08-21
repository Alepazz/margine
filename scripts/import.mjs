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
  return `${expense.date}-${hash8(`${expense.title}|${expense.amount}|${expense.tricount}`)}`
}

const cents = (value) => Math.round(Number(value) * 100)

function dayDistance(a, b) {
  const ms = Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`))
  return Math.round(ms / 86_400_000)
}

/**
 * Da quando le spese si aggiungono anche dall'app, la stessa cena può arrivare
 * due volte: una battuta al ristorante, una dal tricount il mese dopo. Gli id
 * non se ne accorgono, perché quello dell'app è casuale e quello dell'import è
 * ricavato dal titolo — e due titoli diversi per la stessa cena sono la norma.
 *
 * Il sospetto è: **stesso importo al centesimo, e data che dista al massimo un
 * giorno.** Le voci sospette non entrano, e vengono elencate: meglio una spesa
 * da reimportare a mano che un numero raddoppiato in silenzio. Con `--doppie`
 * entrano comunque.
 */
function findTwin(expense, master) {
  const amount = cents(expense.amount)
  return master.find(
    (other) =>
      cents(other.amount) === amount &&
      other.tricount === expense.tricount &&
      dayDistance(other.date, expense.date) <= 1,
  )
}

/**
 * Le quote si possono omettere: `split: "half" | "me" | "partner"` basta.
 * In un tricount con un membro solo il default è «tutta del membro»: è il
 * tricount a dirlo, non un id speciale. → ADR-0037
 */
function withShares(expense, tricountsById) {
  if (expense.shares) return expense
  const home = tricountsById.get(expense.tricount)
  const sole = home && home.members?.length === 1 ? home.members[0] : undefined
  const split = expense.split ?? sole ?? 'half'
  const paidBy = expense.paidBy ?? sole ?? 'me'
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
        : { version: 2, updatedAt: new Date().toISOString(), expenses: [], tricounts: [] }

      const byId = new Map(master.expenses.map((expense) => [expense.id, expense]))
      const tricountsById = new Map(master.tricounts.map((tricount) => [tricount.id, tricount]))

      const allowTwins = process.argv.includes('--doppie')
      let added = 0
      let skipped = 0
      let tripsAdded = 0
      const twins = []

      for (const name of files) {
        const raw = readJson(join(PATHS.incoming, name))
        const incomingExpenses = Array.isArray(raw) ? raw : (raw.expenses ?? [])
        const incomingTricounts = Array.isArray(raw) ? [] : (raw.tricounts ?? [])

        for (const tricount of incomingTricounts) {
          if (!tricountsById.has(tricount.id)) {
            tricountsById.set(tricount.id, tricount)
            tripsAdded += 1
          }
        }

        for (const entry of incomingExpenses) {
          const expense = withShares(entry, tricountsById)
          const id = expense.id ?? idFor(expense)
          if (byId.has(id)) {
            skipped += 1
            continue
          }
          if (!allowTwins) {
            const twin = findTwin(expense, [...byId.values()])
            if (twin) {
              twins.push({ incoming: expense, twin })
              continue
            }
          }
          byId.set(id, { ...expense, id })
          added += 1
        }

        log(`· ${name}: ${incomingExpenses.length} voci, ${incomingTricounts.length} tricount`)
      }

      const merged = {
        version: 2,
        updatedAt: new Date().toISOString(),
        expenses: [...byId.values()].sort((a, b) =>
          a.date === b.date ? String(a.id).localeCompare(String(b.id)) : a.date < b.date ? -1 : 1,
        ),
        /* I registri stabili prima, i viaggi in ordine di partenza. */
        tricounts: [...tricountsById.values()].sort((a, b) => {
          if (!a.trip && !b.trip) return 0
          if (!a.trip) return -1
          if (!b.trip) return 1
          return a.trip.start < b.trip.start ? -1 : 1
        }),
      }

      log('')
      log(`Aggiunte ${added} spese, ${tripsAdded} tricount. Già presenti (saltate): ${skipped}.`)

      /*
       * Il master si ricostruisce da zero a ogni import, quindi **tutto ciò che
       * non arriva dai tricount va riportato a mano**, o l'import lo cancella in
       * silenzio: i rimborsi registrati dall'app e le rilevazioni di prezzo.
       * Un campo nuovo del dataset che nasce nell'app va aggiunto anche qui.
       * → ADR-0019, ADR-0041
       */
      if (master.settlements) merged.settlements = master.settlements
      if (master.prices) merged.prices = master.prices

      if (twins.length > 0) {
        const total = twins.reduce((sum, t) => sum + cents(t.incoming.amount), 0) / 100
        log('')
        /* L'accordo al plurale su tre parole diverse è un modo sicuro di
           sbagliare: la frase gira intorno al problema. */
        const quante = twins.length === 1 ? '1 voce sembra' : `${twins.length} voci sembrano`
        log(`⚠ ${quante} già esserci: lasciate fuori dall'import (${total.toFixed(2)} €).`)
        for (const { incoming, twin } of twins) {
          log(`   in arrivo  ${incoming.date}  ${Number(incoming.amount).toFixed(2)} €  «${incoming.title}»`)
          log(`   già dentro ${twin.date}  ${Number(twin.amount).toFixed(2)} €  «${twin.title}»  (${twin.id})`)
          log('')
        }
        log('   Stesso importo e data a meno di un giorno: probabile la stessa spesa,')
        log('   inserita dall\'app e poi arrivata anche dal tricount.')
        log('   Se sono davvero diverse: npm run import -- --doppie')
        log('')
      }

      log(`Master: ${merged.expenses.length} spese, ${merged.tricounts.length} tricount.`)

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
