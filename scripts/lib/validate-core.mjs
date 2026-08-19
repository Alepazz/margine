/**
 * Controlli sui dati, prima che entrino nell'app.
 *
 * È il passaggio che rende sicura la sessione mensile: se le quote non sommano
 * all'importo, se una spesa di viaggio non ha il viaggio, se una categoria non
 * esiste, lo si vede prima di cifrare — non sei mesi dopo dentro un grafico.
 */

const SOURCES = new Set(['fisse', 'personali', 'condivise', 'vacanze'])
const PEOPLE = ['me', 'partner']
/** Chi può aver anticipato: in vacanza anche uno del gruppo. */
const PAYERS = ['me', 'partner', 'others']
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

const cents = (value) => Math.round(value * 100)

export function validateDataset(dataset, config) {
  const errors = []
  const warnings = []

  if (!dataset || typeof dataset !== 'object') {
    return { errors: ['Il dataset non è un oggetto.'], warnings, report: null }
  }
  if (!Array.isArray(dataset.expenses)) errors.push('Manca l\'elenco `expenses`.')
  if (!Array.isArray(dataset.trips)) errors.push('Manca l\'elenco `trips`.')
  if (errors.length > 0) return { errors, warnings, report: null }

  const categoryIds = new Set((config?.categories ?? []).map((c) => c.id))
  const subIds = new Map(
    (config?.categories ?? []).map((c) => [c.id, new Set((c.subcategories ?? []).map((s) => s.id))]),
  )
  const tripIds = new Set(dataset.trips.map((t) => t.id))
  const seenIds = new Set()

  for (const trip of dataset.trips) {
    const where = `viaggio ${trip.id ?? '(senza id)'}`
    if (!trip.id) errors.push(`${where}: manca l'id.`)
    for (const field of ['name', 'place', 'start', 'end']) {
      if (!trip[field]) errors.push(`${where}: manca «${field}».`)
    }
    if (trip.start && !DATE_RE.test(trip.start)) errors.push(`${where}: data di inizio non valida (${trip.start}).`)
    if (trip.end && !DATE_RE.test(trip.end)) errors.push(`${where}: data di fine non valida (${trip.end}).`)
    if (trip.start && trip.end && trip.end < trip.start) errors.push(`${where}: finisce prima di cominciare.`)
    if (trip.start && trip.year !== Number(trip.start.slice(0, 4))) {
      warnings.push(`${where}: l'anno (${trip.year}) non coincide con la data di inizio (${trip.start}).`)
    }
  }

  for (const expense of dataset.expenses) {
    const where = `spesa ${expense.id ?? '(senza id)'} «${expense.title ?? ''}»`

    if (!expense.id) errors.push(`${where}: manca l'id.`)
    else if (seenIds.has(expense.id)) errors.push(`id duplicato: ${expense.id}.`)
    else seenIds.add(expense.id)

    if (!DATE_RE.test(expense.date ?? '')) errors.push(`${where}: data non valida (${expense.date}).`)
    if (typeof expense.title !== 'string' || expense.title.trim() === '') {
      errors.push(`${where}: manca la descrizione.`)
    }
    if (typeof expense.amount !== 'number' || !Number.isFinite(expense.amount)) {
      errors.push(`${where}: importo non valido.`)
    } else if (expense.amount <= 0) {
      warnings.push(`${where}: importo non positivo (${expense.amount}).`)
    } else if (cents(expense.amount) !== Math.round(expense.amount * 100)) {
      warnings.push(`${where}: più di due decimali.`)
    }

    if (!expense.shares || typeof expense.shares !== 'object') {
      errors.push(`${where}: mancano le quote.`)
    } else {
      let sum = 0
      for (const person of PEOPLE) {
        const share = expense.shares[person]
        if (typeof share !== 'number' || !Number.isFinite(share) || share < 0) {
          errors.push(`${where}: quota «${person}» non valida (${share}).`)
        } else {
          sum += cents(share)
        }
      }
      // La quota di terzi è opzionale, ma se c'è entra nella somma: l'invariante
      // è me + partner + others = importo, mai «il resto si perde».
      const others = expense.shares.others
      if (others !== undefined) {
        if (typeof others !== 'number' || !Number.isFinite(others) || others < 0) {
          errors.push(`${where}: quota «others» non valida (${others}).`)
        } else {
          sum += cents(others)
        }
      }
      if (typeof expense.amount === 'number' && sum !== cents(expense.amount)) {
        errors.push(
          `${where}: le quote sommano ${(sum / 100).toFixed(2)} ma l'importo è ${expense.amount.toFixed(2)}.`,
        )
      }
      if (others !== undefined && expense.source !== 'vacanze') {
        warnings.push(`${where}: ha una quota di terzi ma non è una spesa di vacanza.`)
      }
    }

    if (!PAYERS.includes(expense.paidBy)) errors.push(`${where}: «paidBy» non valido (${expense.paidBy}).`)
    if (!SOURCES.has(expense.source)) errors.push(`${where}: origine non valida (${expense.source}).`)
    if (typeof expense.recurring !== 'boolean') errors.push(`${where}: «recurring» deve essere booleano.`)

    if (!categoryIds.has(expense.category)) {
      errors.push(`${where}: categoria sconosciuta (${expense.category}).`)
    } else if (expense.subcategory) {
      const allowed = subIds.get(expense.category)
      if (allowed && allowed.size > 0 && !allowed.has(expense.subcategory)) {
        warnings.push(`${where}: sottocategoria «${expense.subcategory}» non prevista in ${expense.category}.`)
      }
    }

    if (expense.source === 'vacanze') {
      if (!expense.trip) errors.push(`${where}: spesa di vacanza senza viaggio.`)
      else if (!tripIds.has(expense.trip)) errors.push(`${where}: viaggio inesistente (${expense.trip}).`)
    } else if (expense.trip) {
      warnings.push(`${where}: ha un viaggio ma non è nel tricount vacanze.`)
    }

    if (expense.receiptLinks !== undefined) {
      if (!Array.isArray(expense.receiptLinks)) errors.push(`${where}: «receiptLinks» deve essere una lista.`)
      else {
        for (const link of expense.receiptLinks) {
          if (typeof link !== 'string' || !/^https?:\/\//.test(link)) {
            errors.push(`${where}: link scontrino non valido (${link}).`)
          }
        }
      }
    }
    if (expense.tax730 !== undefined && typeof expense.tax730 !== 'boolean') {
      errors.push(`${where}: «tax730» deve essere booleano.`)
    }
    if (expense.welfare !== undefined) {
      if (typeof expense.welfare !== 'boolean') {
        errors.push(`${where}: «welfare» deve essere booleano.`)
      } else if (expense.welfare && expense.paidBy === 'others') {
        // Il welfare è di chi paga: su un conto anticipato da un terzo non vuol dire niente.
        warnings.push(`${where}: segnata welfare ma anticipata da qualcun altro.`)
      }
    }
    if (expense.notes !== undefined && typeof expense.notes !== 'string') {
      errors.push(`${where}: «notes» deve essere testo.`)
    }
  }

  return { errors, warnings, report: buildReport(dataset) }
}

/** Totali per mese e per origine: sono i numeri da confrontare con Tricount. */
export function buildReport(dataset) {
  const months = new Map()
  for (const expense of dataset.expenses) {
    const month = String(expense.date ?? '').slice(0, 7)
    const row =
      months.get(month) ?? { month, total: 0, me: 0, partner: 0, others: 0, count: 0, sources: {} }
    row.total += cents(expense.amount ?? 0)
    row.me += cents(expense.shares?.me ?? 0)
    row.partner += cents(expense.shares?.partner ?? 0)
    row.others += cents(expense.shares?.others ?? 0)
    row.count += 1
    row.sources[expense.source] = (row.sources[expense.source] ?? 0) + cents(expense.amount ?? 0)
    months.set(month, row)
  }
  const rows = [...months.values()]
    .sort((a, b) => (a.month < b.month ? -1 : 1))
    .map((row) => ({
      ...row,
      total: row.total / 100,
      me: row.me / 100,
      partner: row.partner / 100,
      others: row.others / 100,
      sources: Object.fromEntries(Object.entries(row.sources).map(([k, v]) => [k, v / 100])),
    }))
  return {
    months: rows,
    expenses: dataset.expenses.length,
    trips: dataset.trips.length,
    total: rows.reduce((acc, r) => acc + cents(r.total), 0) / 100,
    tagged730: dataset.expenses.filter((e) => e.tax730).length,
  }
}

export function printReport(report, log) {
  if (!report) return
  log('')
  log(`Spese: ${report.expenses} · viaggi: ${report.trips} · segnate 730: ${report.tagged730}`)
  log(`Totale complessivo: ${report.total.toFixed(2)} €`)
  log('')
  const anyOthers = report.months.some((row) => row.others > 0)
  log(`mese      voci    totale        quota me   quota partner${anyOthers ? '   quota altri' : ''}`)
  for (const row of report.months) {
    log(
      `${row.month}   ${String(row.count).padStart(4)}   ${row.total.toFixed(2).padStart(9)} €   ` +
        `${row.me.toFixed(2).padStart(8)} €   ${row.partner.toFixed(2).padStart(8)} €` +
        (anyOthers ? `   ${row.others.toFixed(2).padStart(8)} €` : ''),
    )
  }
}
