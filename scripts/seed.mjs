/**
 * Dati di esempio, per poter provare l'app prima che arrivino quelli veri.
 *
 * Sono verosimili ma inventati: venti mesi di spese sui quattro tricount, un
 * gatto, quattro viaggi e qualche spesa già segnata per il 730. Deterministici
 * (generatore con seme fisso), così due esecuzioni danno lo stesso risultato.
 *
 * Scrive sempre in `data-example/`; copia in `data/` solo se è vuota, per non
 * sovrascrivere mai i dati reali.
 */

import { PATHS, exists, log, writeJson } from './lib/io.mjs'
import {
  CATEGORIES as TAXONOMY,
  CAT_CATEGORY,
  HOUSE_CATEGORY,
  HOUSE_SOURCE,
  TRIP_CATEGORY,
} from './lib/taxonomy.mjs'
import { sharesFor } from './lib/money.mjs'

const TODAY = '2026-08-19'
/** Da dove parte il saldo nei dati di esempio: dieci giorni prima di «oggi». */
const BALANCE_SINCE = '2026-08-09'
const FIRST_MONTH = '2025-01'

// ─────────────────────── generatore deterministico ───────────────────────

function mulberry32(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(20260819)
const between = (min, max) => min + rand() * (max - min)
const money = (min, max) => Math.round(between(min, max) * 100) / 100
const pick = (list) => list[Math.floor(rand() * list.length)]
const chance = (p) => rand() < p
const intBetween = (min, max) => Math.floor(between(min, max + 1))

// ─────────────────────── calendario ───────────────────────

function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

function addMonths(month, delta) {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

function monthsUpTo(from, to) {
  const out = []
  let cursor = from
  while (cursor <= to) {
    out.push(cursor)
    cursor = addMonths(cursor, 1)
  }
  return out
}

function dateOf(month, day) {
  const clamped = Math.min(Math.max(1, day), daysInMonth(month))
  return `${month}-${String(clamped).padStart(2, '0')}`
}

const MONTHS = monthsUpTo(FIRST_MONTH, TODAY.slice(0, 7))

// ─────────────────────── categorie ───────────────────────

const CATEGORIES = TAXONOMY

// ─────────────────────── viaggi ───────────────────────

const TRIPS = [
  {
    id: '2025-sicilia',
    name: 'Sicilia in macchina',
    place: 'Sicilia',
    country: 'Italia',
    year: 2025,
    start: '2025-05-24',
    end: '2025-06-01',
    coords: { lat: 37.6, lon: 14.0, approx: true },
  },
  {
    id: '2025-lofoten',
    name: 'Isole Lofoten',
    place: 'Lofoten',
    country: 'Norvegia',
    year: 2025,
    start: '2025-08-09',
    end: '2025-08-18',
    coords: { lat: 68.2, lon: 14.0, approx: true },
  },
  {
    id: '2026-lisbona',
    name: 'Weekend a Lisbona',
    place: 'Lisbona',
    country: 'Portogallo',
    year: 2026,
    start: '2026-03-12',
    end: '2026-03-16',
    coords: { lat: 38.72, lon: -9.14 },
  },
  {
    id: '2026-dolomiti',
    name: 'Dolomiti',
    place: 'Dolomiti',
    country: 'Italia',
    year: 2026,
    start: '2026-07-04',
    end: '2026-07-11',
    coords: { lat: 46.4, lon: 11.8, approx: true },
  },
]

// ─────────────────────── costruzione spese ───────────────────────

const expenses = []
let counter = 0

function add(expense) {
  if (expense.date > TODAY) return
  counter += 1
  const paidBy = expense.paidBy ?? (chance(0.62) ? 'me' : 'partner')
  const split = expense.split ?? 'half'
  const entry = {
    id: `${expense.date}-${String(counter).padStart(4, '0')}`,
    date: expense.date,
    title: expense.title,
    amount: expense.amount,
    shares: sharesFor(expense.amount, split, paidBy),
    paidBy,
    source: expense.source,
    category: expense.category,
    recurring: expense.recurring ?? false,
  }
  if (expense.subcategory) entry.subcategory = expense.subcategory
  if (expense.trip) entry.trip = expense.trip
  if (expense.tax730) entry.tax730 = true
  if (expense.notes) entry.notes = expense.notes
  if (expense.receiptLinks) entry.receiptLinks = expense.receiptLinks
  expenses.push(entry)
}

const FAKE_DRIVE = (name) => `https://drive.google.com/file/d/esempio-${name}/view`

// ── Spese fisse condivise ──
for (const month of MONTHS) {
  const winter = ['12', '01', '02', '03'].includes(month.slice(5))
  add({
    date: dateOf(month, 3),
    title: 'Affitto',
    amount: 950,
    source: 'fisse',
    category: 'casa',
    subcategory: 'affitto',
    recurring: true,
    paidBy: 'me',
  })
  add({
    date: dateOf(month, 5),
    title: 'Spese condominiali',
    amount: 85,
    source: 'fisse',
    category: 'casa',
    subcategory: 'bollette',
    recurring: true,
  })
  add({
    date: dateOf(month, 12),
    title: winter ? 'Luce e gas (inverno)' : 'Luce e gas',
    amount: winter ? money(115, 168) : money(52, 84),
    source: 'fisse',
    category: 'casa',
    subcategory: 'bollette',
    recurring: true,
  })
  add({
    date: dateOf(month, 8),
    title: 'Internet casa',
    amount: 27.9,
    source: 'fisse',
    category: 'casa',
    subcategory: 'bollette',
    recurring: true,
    paidBy: 'partner',
  })
  add({
    date: dateOf(month, 15),
    title: 'Netflix e Spotify',
    amount: 17.98,
    source: 'fisse',
    category: 'tempolibero',
    subcategory: 'abbonamenti',
    recurring: true,
  })
  if (['01', '04', '07', '10'].includes(month.slice(5))) {
    add({
      date: dateOf(month, 20),
      title: 'TARI (rata trimestrale)',
      amount: money(58, 72),
      source: 'fisse',
      category: 'casa',
      subcategory: 'bollette',
      recurring: true,
    })
  }
}

// ── Spese personali ──
const LUNCH = ['Pranzo in mensa', 'Pausa pranzo', 'Panino al bar', 'Pranzo fuori ufficio']
const BOOKS = ['Libreria', 'Libro usato', 'Fumetteria']
for (const month of MONTHS) {
  add({
    date: dateOf(month, 2),
    title: 'Palestra',
    amount: 45,
    source: 'personali',
    category: 'tempolibero',
    subcategory: 'sport',
    recurring: true,
    split: 'me',
    paidBy: 'me',
  })
  add({
    date: dateOf(month, 10),
    title: 'Telefono',
    amount: 9.99,
    source: 'personali',
    category: 'altro',
    recurring: true,
    split: 'me',
    paidBy: 'me',
  })
  for (let i = 0; i < intBetween(2, 3); i += 1) {
    add({
      date: dateOf(month, intBetween(1, 28)),
      title: 'Benzina',
      amount: money(48, 78),
      source: 'personali',
      category: 'trasporti',
      subcategory: 'carburante',
      split: 'me',
      paidBy: 'me',
    })
  }
  for (let i = 0; i < intBetween(4, 9); i += 1) {
    add({
      date: dateOf(month, intBetween(1, 28)),
      title: pick(LUNCH),
      amount: money(6.5, 14.5),
      source: 'personali',
      category: 'ristoranti',
      split: 'me',
      paidBy: 'me',
    })
  }
  if (chance(0.7)) {
    add({
      date: dateOf(month, intBetween(5, 25)),
      title: 'Barbiere',
      amount: money(18, 25),
      source: 'personali',
      category: 'altro',
      split: 'me',
      paidBy: 'me',
    })
  }
  if (chance(0.45)) {
    add({
      date: dateOf(month, intBetween(3, 27)),
      title: pick(['Maglietta', 'Jeans', 'Scarpe', 'Felpa', 'Giacca leggera']),
      amount: money(24, 95),
      source: 'personali',
      category: 'abbigliamento',
      split: 'me',
      paidBy: 'me',
    })
  }
  if (chance(0.4)) {
    add({
      date: dateOf(month, intBetween(3, 27)),
      title: pick(BOOKS),
      amount: money(12, 32),
      source: 'personali',
      category: 'tempolibero',
      subcategory: 'musica',
      split: 'me',
      paidBy: 'me',
    })
  }
  if (chance(0.3)) {
    add({
      date: dateOf(month, intBetween(3, 27)),
      title: 'Farmacia',
      amount: money(9, 34),
      source: 'personali',
      category: 'salute',
      subcategory: 'farmacia',
      split: 'me',
      paidBy: 'me',
    })
  }
}

// ── Altre spese condivise ──
const SUPERMARKETS = ['Esselunga', 'Conad', 'Lidl', 'Coop', 'Mercato rionale']
const RESTAURANTS = [
  'Pizzeria da Michele',
  'Trattoria del Borgo',
  'Sushi',
  'Aperitivo con amici',
  'Cena fuori',
  'Brunch',
  'Hamburgeria',
]
for (const month of MONTHS) {
  for (let i = 0; i < intBetween(4, 6); i += 1) {
    add({
      date: dateOf(month, 2 + i * 6 + intBetween(0, 3)),
      title: `Spesa ${pick(SUPERMARKETS)}`,
      amount: money(48, 118),
      source: 'condivise',
      category: 'spesa',
    })
  }
  for (let i = 0; i < intBetween(2, 4); i += 1) {
    add({
      date: dateOf(month, intBetween(1, 28)),
      title: pick(RESTAURANTS),
      amount: money(28, 92),
      source: 'condivise',
      category: 'ristoranti',
    })
  }

  // Il gatto: cibo ogni mese, lettiera a mesi alterni, veterinario ogni tanto.
  add({
    date: dateOf(month, intBetween(6, 22)),
    title: pick(['Crocchette e umido', 'Cibo gatto (Arcaplanet)', 'Scatolette e crocchette']),
    amount: money(29, 46),
    source: 'condivise',
    category: 'gatto',
    subcategory: 'cibo',
  })
  if (chance(0.55)) {
    add({
      date: dateOf(month, intBetween(4, 26)),
      title: 'Lettiera',
      amount: money(9.5, 15),
      source: 'condivise',
      category: 'gatto',
      subcategory: 'lettiera',
    })
  }
  if (chance(0.18)) {
    add({
      date: dateOf(month, intBetween(4, 26)),
      title: pick(['Tiragraffi', 'Giochini', 'Trasportino nuovo', 'Spazzola']),
      amount: money(11, 48),
      source: 'condivise',
      category: 'gatto',
      subcategory: 'accessori',
    })
  }
  if (chance(0.35)) {
    add({
      date: dateOf(month, intBetween(6, 24)),
      title: 'Spesa per la casa',
      amount: money(18, 120),
      source: 'condivise',
      category: 'casa',
      subcategory: 'arredo',
    })
  }
  if (chance(0.4)) {
    add({
      date: dateOf(month, intBetween(6, 24)),
      title: pick(['Cinema', 'Concerto', 'Mostra', 'Teatro']),
      amount: money(18, 64),
      source: 'condivise',
      category: 'tempolibero',
      subcategory: 'spettacoli',
    })
  }
  if (chance(0.35)) {
    add({
      date: dateOf(month, intBetween(6, 24)),
      title: pick(['Treno per Milano', 'Biglietti treno', 'Pedaggi e parcheggio']),
      amount: money(14, 68),
      source: 'condivise',
      category: 'trasporti',
      subcategory: pick(['autostrada', 'parcheggi', 'mezzi']),
    })
  }
  if (chance(0.22)) {
    add({
      date: dateOf(month, intBetween(6, 24)),
      title: pick(['Regalo compleanno', 'Regalo matrimonio', 'Regalo per i suoi']),
      amount: money(25, 110),
      source: 'condivise',
      category: 'regali',
    })
  }
}

// ── Spese sanitarie e veterinarie: quelle che finiscono nel 730 ──
const HEALTH_EVENTS = [
  {
    date: '2025-02-18',
    title: 'Visita dermatologica',
    amount: 130,
    category: 'salute',
    subcategory: 'visite',
    source: 'condivise',
    split: 'me',
    tax730: true,
    notes: 'Fattura intestata a me, chiesta via mail e archiviata.',
    receiptLinks: [FAKE_DRIVE('visita-dermatologica-2025')],
  },
  {
    date: '2025-04-09',
    title: 'Veterinario — vaccino annuale',
    amount: 85,
    category: 'gatto',
    subcategory: 'veterinario',
    source: 'condivise',
    tax730: true,
    notes: 'Spese veterinarie: detraibili entro il limite annuale. Ricevuta con codice fiscale mio.',
    receiptLinks: [FAKE_DRIVE('veterinario-vaccino-2025')],
  },
  {
    date: '2025-09-22',
    title: 'Dentista — igiene e otturazione',
    amount: 260,
    category: 'salute',
    subcategory: 'visite',
    source: 'condivise',
    split: 'me',
    tax730: true,
    notes: 'Pagato con bancomat, fattura elettronica già nel sistema tessera sanitaria.',
    receiptLinks: [FAKE_DRIVE('dentista-2025')],
  },
  {
    date: '2025-11-14',
    title: 'Veterinario — analisi del sangue',
    amount: 142,
    category: 'gatto',
    subcategory: 'veterinario',
    source: 'condivise',
    tax730: true,
    notes: 'Controllo per la tiroide. Ricevuta da chiedere di nuovo: la foto è venuta mossa.',
  },
  {
    date: '2026-01-27',
    title: 'Occhiali da vista',
    amount: 310,
    category: 'salute',
    subcategory: 'occhiali',
    source: 'personali',
    split: 'me',
    tax730: true,
    notes: 'Con prescrizione dell’oculista, allegata.',
    receiptLinks: [FAKE_DRIVE('occhiali-2026'), FAKE_DRIVE('prescrizione-oculista-2026')],
  },
  {
    date: '2026-04-15',
    title: 'Veterinario — controllo annuale',
    amount: 95,
    category: 'gatto',
    subcategory: 'veterinario',
    source: 'condivise',
    tax730: true,
    notes: 'Vaccino trivalente più controllo denti.',
  },
  {
    date: '2026-05-06',
    title: 'Fisioterapia (5 sedute)',
    amount: 250,
    category: 'salute',
    subcategory: 'visite',
    source: 'personali',
    split: 'me',
    tax730: true,
  },
  {
    date: '2026-06-19',
    title: 'Analisi cliniche',
    amount: 78,
    category: 'salute',
    subcategory: 'visite',
    source: 'personali',
    split: 'me',
  },
  {
    date: '2026-07-28',
    title: 'Abbonamento annuale mezzi pubblici',
    amount: 330,
    category: 'trasporti',
    subcategory: 'mezzi',
    source: 'personali',
    split: 'me',
    notes: 'Da chiedere al commercialista: l’abbonamento ai mezzi è detraibile.',
  },
]
for (const event of HEALTH_EVENTS) {
  add({ ...event, paidBy: 'me' })
}

// ── Vacanze ──
const TRIP_PLAN = {
  '2025-sicilia': [
    { title: 'Voli Milano–Catania', amount: 268, category: 'viaggi', subcategory: 'trasporti', day: 0 },
    { title: 'Noleggio auto', amount: 310, category: 'trasporti', subcategory: 'auto', day: 0 },
    { title: 'B&B Ortigia (4 notti)', amount: 520, category: 'viaggi', subcategory: 'alloggio', day: 1 },
    { title: 'Agriturismo Etna (3 notti)', amount: 345, category: 'viaggi', subcategory: 'alloggio', day: 5 },
    { title: 'Cena di pesce a Siracusa', amount: 84, category: 'ristoranti', day: 2 },
    { title: 'Pranzo a Noto', amount: 46, category: 'ristoranti', day: 3 },
    { title: 'Escursione sull’Etna', amount: 130, category: 'viaggi', subcategory: 'attivita', day: 5 },
    { title: 'Valle dei Templi', amount: 26, category: 'viaggi', subcategory: 'attivita', day: 6 },
    { title: 'Benzina e pedaggi', amount: 96, category: 'trasporti', subcategory: 'carburante', day: 4 },
    { title: 'Spesa e granite', amount: 58, category: 'spesa', day: 3 },
    { title: 'Cena ultima sera', amount: 72, category: 'ristoranti', day: 7 },
  ],
  '2025-lofoten': [
    { title: 'Voli Milano–Bodø', amount: 462, category: 'viaggi', subcategory: 'trasporti', day: 0 },
    { title: 'Traghetto e trasferimenti', amount: 138, category: 'trasporti', subcategory: 'mezzi', day: 0 },
    { title: 'Rorbu a Reine (5 notti)', amount: 780, category: 'viaggi', subcategory: 'alloggio', day: 1 },
    { title: 'Cabina a Henningsvær (3 notti)', amount: 430, category: 'viaggi', subcategory: 'alloggio', day: 6 },
    { title: 'Noleggio auto Lofoten', amount: 395, category: 'trasporti', subcategory: 'auto', day: 1 },
    { title: 'Spesa al Rema 1000', amount: 145, category: 'spesa', day: 2 },
    { title: 'Spesa (secondo giro)', amount: 96, category: 'spesa', day: 6 },
    { title: 'Escursione in kayak', amount: 190, category: 'viaggi', subcategory: 'attivita', day: 4 },
    { title: 'Safari fotografico aquile', amount: 156, category: 'viaggi', subcategory: 'attivita', day: 7 },
    { title: 'Cena a base di stoccafisso', amount: 118, category: 'ristoranti', day: 3 },
    { title: 'Caffè e waffle', amount: 34, category: 'ristoranti', day: 5 },
    { title: 'Souvenir e cartoline', amount: 42, category: 'viaggi', subcategory: 'souvenir', day: 8 },
  ],
  '2026-lisbona': [
    { title: 'Voli Milano–Lisbona', amount: 196, category: 'viaggi', subcategory: 'trasporti', day: 0 },
    { title: 'Hotel Alfama (4 notti)', amount: 445, category: 'viaggi', subcategory: 'alloggio', day: 0 },
    { title: 'Pastéis de Belém e caffè', amount: 22, category: 'ristoranti', day: 1 },
    { title: 'Cena in Bairro Alto', amount: 76, category: 'ristoranti', day: 1 },
    { title: 'Tram 28 e metro', amount: 28, category: 'trasporti', subcategory: 'mezzi', day: 2 },
    { title: 'Ingresso Monastero dos Jerónimos', amount: 24, category: 'viaggi', subcategory: 'attivita', day: 2 },
    { title: 'Gita a Sintra', amount: 68, category: 'viaggi', subcategory: 'attivita', day: 3 },
    { title: 'Cena di pesce a Cascais', amount: 88, category: 'ristoranti', day: 3 },
  ],
  '2026-dolomiti': [
    { title: 'Treno e navetta per Ortisei', amount: 178, category: 'viaggi', subcategory: 'trasporti', day: 0 },
    { title: 'Baita in Val Gardena (7 notti)', amount: 910, category: 'viaggi', subcategory: 'alloggio', day: 0 },
    { title: 'Impianti di risalita', amount: 124, category: 'viaggi', subcategory: 'attivita', day: 1 },
    { title: 'Rifugio Firenze — pranzo', amount: 62, category: 'ristoranti', day: 1 },
    { title: 'Spesa per la baita', amount: 132, category: 'spesa', day: 0 },
    { title: 'Cena in malga', amount: 78, category: 'ristoranti', day: 3 },
    { title: 'Noleggio e-bike', amount: 96, category: 'viaggi', subcategory: 'attivita', day: 4 },
    { title: 'Terme di Vipiteno', amount: 58, category: 'viaggi', subcategory: 'attivita', day: 5 },
    { title: 'Rifugio con vista Sassolungo', amount: 54, category: 'ristoranti', day: 6 },
  ],
}

function shiftDate(iso, days) {
  const [y, m, d] = iso.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d + days))
  return shifted.toISOString().slice(0, 10)
}

for (const trip of TRIPS) {
  for (const item of TRIP_PLAN[trip.id] ?? []) {
    add({
      date: shiftDate(trip.start, item.day),
      title: item.title,
      amount: item.amount,
      source: 'vacanze',
      category: item.category,
      subcategory: item.subcategory,
      trip: trip.id,
    })
  }
}

expenses.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1))

// ─────────────────────── config ───────────────────────

const config = {
  version: 1,
  people: {
    me: { name: 'Alessio', emoji: '🧔' },
    partner: { name: 'Federica', emoji: '👩' },
  },
  income: {
    me: {
      configured: true,
      netMonthly: 2200,
      extraMonths: 1,
      annualBonusNet: 1500,
      mealVouchers: { valuePerDay: 8, daysPerMonth: 20 },
      otherMonthlyNet: 0,
      monthlySavingsTarget: 300,
      note: 'Valori di esempio: da sostituire con quelli veri nell’intervista sulle entrate.',
    },
    partner: null,
  },
  categories: CATEGORIES,
  catCategory: CAT_CATEGORY,
  tripCategory: TRIP_CATEGORY,
  houseSource: HOUSE_SOURCE,
  houseCategory: HOUSE_CATEGORY,
  balance: {
    /* Qualche giorno indietro, non oggi: con la data di oggi non ci sarebbe
       nessun movimento e la pagina del saldo non mostrerebbe niente di quello
       che sa fare. La data è INCLUSIVA. */
    since: BALANCE_SINCE,
    opening: 0,
    note: 'Residuo non attribuibile a un tricount: nei dati di esempio è zero. La data è di ripiego per i tricount che non dichiarano la propria, ed è INCLUSIVA.',
    /*
     * Un punto di partenza per tricount, come nella realtà: su Tricount ci si
     * salda un gruppo alla volta. Ne sono dichiarati due su quattro di proposito,
     * così i dati di esempio mostrano anche l'avviso su quelli che mancano.
     * → ADR-0022
     */
    groups: {
      fisse: { since: BALANCE_SINCE, opening: 12.5, note: 'Punto di partenza di esempio.' },
      /* La chiave di una vacanza porta il prefisso: un tricount per viaggio. */
      'vacanze/2025-sicilia': { since: TODAY, opening: 0, note: 'Saldata, di esempio.' },
    },
  },
  fiscal: {
    deductibleHints: [
      'salute/psicologo',
      'salute/farmacia',
      'salute/visite',
      'salute/occhiali',
      'gatto/veterinario',
      'burocrazia',
    ],
    driveFolderHint: 'Drive → Scontrini 730 → <anno>',
  },
  github: {
    owner: 'Alepazz',
    repo: 'margine',
    branch: 'main',
    dataPath: 'public/data/expenses.json.enc',
  },
}

const dataset = {
  version: 1,
  updatedAt: `${TODAY}T09:00:00.000Z`,
  expenses,
  trips: TRIPS,
  /* I rimborsi si registrano dall'app: nei dati di esempio si parte da zero. */
  settlements: [],
}

writeJson(`${PATHS.dataExample}/expenses.json`, dataset)
writeJson(`${PATHS.dataExample}/config.json`, config)
log(`✓ Dati di esempio: ${expenses.length} spese, ${TRIPS.length} viaggi in data-example/`)

if (!exists(PATHS.expenses)) {
  writeJson(PATHS.expenses, dataset)
  writeJson(PATHS.config, config)
  log('✓ Copiati anche in data/ (era vuota)')
} else {
  log('· data/ contiene già dei dati: lasciata intatta')
}
