/**
 * Controlli sui dati, prima che entrino nell'app.
 *
 * È il passaggio che rende sicura la sessione mensile: se le quote non sommano
 * all'importo, se una spesa di viaggio non ha il viaggio, se una categoria non
 * esiste, lo si vede prima di cifrare — non sei mesi dopo dentro un grafico.
 */

const PEOPLE = ['me', 'partner']
/** Chi può aver anticipato: in vacanza anche uno del gruppo. */
const PAYERS = ['me', 'partner', 'others']
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

/**
 * La forma non basta: `2026-02-31` supera la regex e non esiste. Il calendario
 * lo sa solo `Date`, quindi si costruisce la data e si controlla che non sia
 * stata riportata avanti da sé.
 */
function isDate(value) {
  if (!DATE_RE.test(value ?? '')) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

const cents = (value) => Math.round(value * 100)

/** Le unità di misura di una rilevazione di prezzo. → ADR-0041 */
const PRICE_UNITS = ['kg', 'l', 'pezzo']

/**
 * Due nomi sono lo stesso nome. È la gemella di `nameKey` in
 * `src/domain/prices.ts`: qui serve solo per un avviso, quindi non c'è un test
 * di parità come per le regole delle spese — se le due divergessero, il peggio
 * che accade è un avviso in più o in meno.
 */
const nameKey = (text) => String(text ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * Al più due decimali, letti dalla **rappresentazione** del numero e non da
 * `Math.round(v * 100)`: in virgola mobile `2.15 * 100` fa 214.99999999999997,
 * quindi il confronto aritmetico segnalerebbe come sbagliato un prezzo giusto.
 */
function atMostTwoDecimals(value) {
  const text = String(value)
  if (text.includes('e') || text.includes('E')) return false
  const decimals = text.split('.')[1]
  return decimals === undefined || decimals.length <= 2
}

export function validateDataset(dataset, config) {
  const errors = []
  const warnings = []

  if (!dataset || typeof dataset !== 'object') {
    return { errors: ['Il dataset non è un oggetto.'], warnings, report: null }
  }
  if (!Array.isArray(dataset.expenses)) errors.push('Manca l\'elenco `expenses`.')
  if (!Array.isArray(dataset.tricounts)) errors.push('Manca l\'elenco `tricounts`.')
  if (errors.length > 0) return { errors, warnings, report: null }

  const categoryIds = new Set((config?.categories ?? []).map((c) => c.id))
  const subIds = new Map(
    (config?.categories ?? []).map((c) => [c.id, new Set((c.subcategories ?? []).map((s) => s.id))]),
  )
  const tricountById = new Map(dataset.tricounts.map((t) => [t.id, t]))
  const seenIds = new Set()

  const seenTricounts = new Set()
  for (const tricount of dataset.tricounts) {
    const where = `tricount ${tricount.id ?? '(senza id)'}`
    if (!tricount.id) errors.push(`${where}: manca l'id.`)
    else if (seenTricounts.has(tricount.id)) errors.push(`id di tricount duplicato: ${tricount.id}.`)
    else seenTricounts.add(tricount.id)

    if (typeof tricount.name !== 'string' || tricount.name.trim() === '') {
      errors.push(`${where}: manca il nome.`)
    }
    /* I membri: almeno uno, tutti conosciuti, senza doppioni. Un tricount di
       nessuno non comparirebbe in nessun menù, e le sue spese sarebbero orfane. */
    if (!Array.isArray(tricount.members) || tricount.members.length === 0) {
      errors.push(`${where}: manca l'elenco dei membri.`)
    } else {
      for (const member of tricount.members) {
        if (!PEOPLE.includes(member)) errors.push(`${where}: membro sconosciuto (${member}).`)
      }
      if (new Set(tricount.members).size !== tricount.members.length) {
        errors.push(`${where}: membro ripetuto.`)
      }
    }

    const trip = tricount.trip
    if (trip) {
      for (const field of ['place', 'start', 'end']) {
        if (!trip[field]) errors.push(`${where}: manca «${field}» nel viaggio.`)
      }
      if (trip.start && !isDate(trip.start)) errors.push(`${where}: data di inizio non valida (${trip.start}).`)
      if (trip.end && !isDate(trip.end)) errors.push(`${where}: data di fine non valida (${trip.end}).`)
      if (trip.start && trip.end && trip.end < trip.start) errors.push(`${where}: finisce prima di cominciare.`)
      if (trip.start && trip.year !== Number(trip.start.slice(0, 4))) {
        warnings.push(`${where}: l'anno (${trip.year}) non coincide con la data di inizio (${trip.start}).`)
      }
    }
  }

  /*
   * I rimborsi fra le due persone. Non sono spese e non entrano in nessun
   * totale: spostano solo il saldo. Il campo può mancare nei file scritti prima
   * di ADR-0019, e allora è una lista vuota.
   */
  const settlements = Array.isArray(dataset.settlements) ? dataset.settlements : []
  const seenSettlements = new Set()
  for (const settlement of settlements) {
    const where = `rimborso ${settlement.id ?? '(senza id)'}`
    if (!settlement.id) errors.push(`${where}: manca l'id.`)
    else if (seenSettlements.has(settlement.id)) errors.push(`id di rimborso duplicato: ${settlement.id}.`)
    else seenSettlements.add(settlement.id)

    if (!isDate(settlement.date)) errors.push(`${where}: data non valida (${settlement.date}).`)
    if (!PEOPLE.includes(settlement.from)) errors.push(`${where}: «from» non valido (${settlement.from}).`)
    if (!PEOPLE.includes(settlement.to)) errors.push(`${where}: «to» non valido (${settlement.to}).`)
    if (settlement.from === settlement.to) errors.push(`${where}: da e verso la stessa persona.`)
    if (typeof settlement.amount !== 'number' || !Number.isFinite(settlement.amount)) {
      errors.push(`${where}: importo non valido.`)
    } else if (settlement.amount <= 0) {
      errors.push(`${where}: importo non positivo (${settlement.amount}).`)
    }
  }

  /*
   * Le rilevazioni di prezzo. Non sono spese: non hanno quote né tricount, e non
   * entrano in nessun totale — l'unica cosa che devono garantire è di essere
   * confrontabili fra loro. Il campo manca nei file scritti prima di ADR-0041.
   */
  const prices = Array.isArray(dataset.prices) ? dataset.prices : []
  if (dataset.prices !== undefined && !Array.isArray(dataset.prices)) {
    errors.push('`prices` deve essere una lista.')
  }
  const seenPrices = new Set()
  const unitByProduct = new Map()
  for (const price of prices) {
    const where = `prezzo ${price.id ?? '(senza id)'} «${price.product ?? ''}»`

    if (!price.id) errors.push(`${where}: manca l'id.`)
    else if (seenPrices.has(price.id)) errors.push(`id di rilevazione duplicato: ${price.id}.`)
    else seenPrices.add(price.id)

    if (typeof price.product !== 'string' || price.product.trim() === '') {
      errors.push(`${where}: manca il prodotto.`)
    }
    if (typeof price.store !== 'string' || price.store.trim() === '') {
      errors.push(`${where}: manca il supermercato.`)
    }
    if (!PRICE_UNITS.includes(price.unit)) {
      errors.push(`${where}: unità sconosciuta (${price.unit}). Attese: ${PRICE_UNITS.join(', ')}.`)
    }
    if (typeof price.price !== 'number' || !Number.isFinite(price.price)) {
      errors.push(`${where}: prezzo non valido.`)
    } else if (price.price <= 0) {
      errors.push(`${where}: prezzo non positivo (${price.price}).`)
    } else if (!atMostTwoDecimals(price.price)) {
      errors.push(`${where}: più di due decimali (${price.price}).`)
    }
    if (!isDate(price.date)) errors.push(`${where}: data non valida (${price.date}).`)
    if (price.note !== undefined && typeof price.note !== 'string') {
      errors.push(`${where}: «note» deve essere testo.`)
    }

    /* Lo stesso prodotto con due unità fa due gruppi che non si confrontano, e
       di solito è un tocco sbagliato sul controllo dell'unità. Non è un errore:
       «uova» al pezzo e al kg può volerlo dire davvero. → ADR-0041 */
    const key = nameKey(price.product)
    if (key !== '' && PRICE_UNITS.includes(price.unit)) {
      const seen = unitByProduct.get(key)
      if (seen === undefined) unitByProduct.set(key, price.unit)
      else if (seen !== price.unit) {
        warnings.push(
          `${where}: «${price.product.trim()}» è rilevato sia in ${seen} sia in ${price.unit}, ` +
            'quindi finisce in due gruppi che non si confrontano fra loro.',
        )
      }
    }
  }

  for (const expense of dataset.expenses) {
    const where = `spesa ${expense.id ?? '(senza id)'} «${expense.title ?? ''}»`

    if (!expense.id) errors.push(`${where}: manca l'id.`)
    else if (seenIds.has(expense.id)) errors.push(`id duplicato: ${expense.id}.`)
    else seenIds.add(expense.id)

    if (!isDate(expense.date)) errors.push(`${where}: data non valida (${expense.date}).`)
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
      /* Le quote appartengono ai membri: in un tricount con un membro solo la
         quota dell'altra persona deve essere zero. → ADR-0037 */
      const home = tricountById.get(expense.tricount)
      if (home && Array.isArray(home.members)) {
        for (const person of PEOPLE) {
          if (home.members.includes(person)) continue
          if (cents(expense.shares[person] ?? 0) > 0) {
            errors.push(`${where}: quota di «${person}», che non è membro di ${expense.tricount}.`)
          }
        }
      }
      if (others !== undefined && home && !home.trip) {
        warnings.push(`${where}: ha una quota di terzi ma non è una spesa di vacanza.`)
      }
    }

    if (!PAYERS.includes(expense.paidBy)) errors.push(`${where}: «paidBy» non valido (${expense.paidBy}).`)
    if (typeof expense.recurring !== 'boolean') errors.push(`${where}: «recurring» deve essere booleano.`)

    if (!categoryIds.has(expense.category)) {
      errors.push(`${where}: categoria sconosciuta (${expense.category}).`)
    } else if (expense.subcategory) {
      const allowed = subIds.get(expense.category)
      if (allowed && allowed.size > 0 && !allowed.has(expense.subcategory)) {
        warnings.push(`${where}: sottocategoria «${expense.subcategory}» non prevista in ${expense.category}.`)
      }
    }

    if (!expense.tricount) errors.push(`${where}: manca il tricount.`)
    else if (!tricountById.has(expense.tricount)) {
      errors.push(`${where}: tricount inesistente (${expense.tricount}).`)
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

  checkBalanceGroups(dataset, config, errors, warnings)
  checkCategoryRefs(config, errors, warnings)
  checkTricountRefs(dataset, config, errors)

  return { errors, warnings, report: buildReport(dataset) }
}

/**
 * I punti di partenza del saldo, uno per tricount.
 *
 * Una chiave scritta male — `vacanze/creta2025` invece di `vacanze/creta-2025` —
 * creerebbe un tricount fantasma con un saldo dichiarato e lascerebbe quello
 * vero non dichiarato, **in silenzio**: il totale cambierebbe e niente lo
 * direbbe. Qui la chiave si confronta con i tricount che esistono davvero.
 * → ADR-0022
 */
/**
 * I riferimenti a tricount nella configurazione: come per le categorie, sono id
 * scritti a mano, e uno sbagliato non rompe niente — la pagina Casa resterebbe
 * vuota, in silenzio. → ADR-0037
 */
function checkTricountRefs(dataset, config, errors) {
  if (!config) return
  const ids = new Set(dataset.tricounts.map((t) => t.id))
  if (config.houseTricount && !ids.has(config.houseTricount)) {
    errors.push(`houseTricount punta a «${config.houseTricount}», che non è un tricount che esiste.`)
  }
}

/**
 * I riferimenti a categorie sparsi nella configurazione.
 *
 * `catCategory`, `tripCategory`, `houseCategory` e i suggerimenti del 730 sono
 * **id di categorie scritti a mano** in mezzo alla configurazione: se la
 * categoria non esiste più, la pagina del gatto resta vuota e i suggerimenti del
 * 730 non trovano niente — senza un errore, perché cercare qualcosa che non c'è
 * non è un guasto. Prima era un caso di svista; da quando le categorie si
 * cancellano dall'app è un caso normale, e va detto. → ADR-0024
 */
function checkCategoryRefs(config, errors, warnings) {
  if (!config) return
  const ids = new Set((config.categories ?? []).map((c) => c.id))
  const subs = new Map(
    (config.categories ?? []).map((c) => [c.id, new Set((c.subcategories ?? []).map((s) => s.id))]),
  )

  for (const key of ['catCategory', 'tripCategory', 'houseCategory']) {
    const value = config[key]
    if (value && !ids.has(value)) {
      errors.push(`${key} punta a «${value}», che non è una categoria che esiste.`)
    }
  }

  for (const hint of config.fiscal?.deductibleHints ?? []) {
    const [category, sub] = String(hint).split('/')
    if (!ids.has(category)) {
      warnings.push(
        `fiscal.deductibleHints contiene «${hint}», e la categoria «${category}» non esiste più: ` +
          'quel suggerimento non troverà mai niente nel 730.',
      )
      continue
    }
    if (sub && !subs.get(category)?.has(sub)) {
      warnings.push(
        `fiscal.deductibleHints contiene «${hint}», e «${sub}» non è più un tipo di «${category}».`,
      )
    }
  }
}

function checkBalanceGroups(dataset, config, errors, warnings) {
  const groups = config?.balance?.groups
  if (!groups) return

  const known = new Set(dataset.tricounts.map((t) => t.id))

  for (const [key, start] of Object.entries(groups)) {
    const where = `balance.groups.${key}`
    if (!known.has(key)) {
      errors.push(
        `${where}: non è un tricount che esiste. Attesi: ${[...known].sort().join(', ')}.`,
      )
      continue
    }
    if (typeof start?.opening !== 'number' || !Number.isFinite(start.opening)) {
      errors.push(`${where}: «opening» deve essere un numero.`)
    }
    if (typeof start?.since !== 'string' || !isDate(start.since)) {
      errors.push(`${where}: «since» deve essere una data AAAA-MM-GG vera.`)
    }
  }

  /* Un tricount con dei debiti e senza punto di partenza non è un errore — la
     pagina lo dichiara — ma vale la pena dirlo qui, dove si guarda una volta al
     mese. */
  const owing = new Set()
  for (const expense of dataset.expenses) {
    if (expense.paidBy === 'others') continue
    const owed = expense.paidBy === 'me' ? expense.shares.partner : expense.shares.me
    if (Math.round(owed * 100) === 0) continue
    owing.add(expense.tricount)
  }
  const missing = [...owing].filter((key) => !groups[key]).sort()
  if (missing.length > 0) {
    warnings.push(
      `balance.groups: ${missing.length} tricount senza punto di partenza (${missing.join(', ')}): il saldo li conta dalla data di ripiego, quindi non è confrontabile con Tricount.`,
    )
  }
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
    row.sources[expense.tricount] = (row.sources[expense.tricount] ?? 0) + cents(expense.amount ?? 0)
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
    trips: dataset.tricounts.filter((t) => t.trip).length,
    total: rows.reduce((acc, r) => acc + cents(r.total), 0) / 100,
    tagged730: dataset.expenses.filter((e) => e.tax730).length,
    prices: Array.isArray(dataset.prices) ? dataset.prices.length : 0,
  }
}

export function printReport(report, log) {
  if (!report) return
  log('')
  log(
    `Spese: ${report.expenses} · viaggi: ${report.trips} · segnate 730: ${report.tagged730}` +
      (report.prices > 0 ? ` · prezzi rilevati: ${report.prices}` : ''),
  )
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
