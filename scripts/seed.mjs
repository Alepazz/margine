/**
 * Dati di esempio, per poter provare l'app prima che arrivino quelli veri.
 *
 * Sono verosimili ma inventati: venti mesi di spese, un gatto, quattro viaggi,
 * **due compartimenti personali** — uno per persona, con dentro qualcosa, così
 * il banco di prova esercita anche la separazione — e qualche spesa già segnata
 * per il 730. Deterministici (generatore con seme fisso), così due esecuzioni
 * danno lo stesso risultato.
 *
 * Scrive sempre in `data-example/`; copia in `data/` solo se è vuota, per non
 * sovrascrivere mai i dati reali.
 */

import { PATHS, exists, log, writeJson } from './lib/io.mjs'
import { cardFaceDataUri } from './lib/png.mjs'
import { eanChecksum } from './lib/validate-core.mjs'
import {
  CATEGORIES as TAXONOMY,
  CAT_CATEGORY,
  HOUSE_CATEGORY,
  HOUSE_TRICOUNT,
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

/*
 * La tassonomia iniziale, più la categoria della rata del progetto.
 *
 * Sta **qui** e non in `taxonomy.mjs`: quella è il valore iniziale di ogni
 * installazione (→ ADR-0024), e un mutuo non ce l'hanno tutti. Senza slot di
 * colore, quindi confluisce in «Altre voci» — la tavolozza resta a otto.
 * → ADR-0079, ADR-0029
 */
const CATEGORIES = [...TAXONOMY, { id: 'mutuo', label: 'Mutuo', emoji: '🔑' }]

// ─────────────────────── tricount ───────────────────────

/* I registri stabili: due condivisi e un compartimento personale per persona.
   «Personale» non è un caso speciale — è un tricount con un membro solo. → ADR-0037 */
const BASE_TRICOUNTS = [
  { id: 'condivise', name: 'Spese condivise', emoji: '🧾', members: ['me', 'partner'] },
  { id: 'personali-alessio', name: 'Le mie spese', emoji: '🙋', members: ['me'] },
  { id: 'personali-federica', name: 'Le sue spese', emoji: '🙆', members: ['partner'] },
  { id: 'fisse', name: 'Casa', emoji: '🏡', members: ['me', 'partner'] },
  /* Un **progetto**: una casa comprata. Sta nei dati di esempio perché il
     modello che lo governa è il più facile da rompere per distrazione — dentro
     lo stesso tricount convivono spese che entrano nei conti del mese e spese
     che ne stanno fuori — e senza un esempio nessuno lo vedrebbe mai al banco.
     → ADR-0079 */
  {
    id: 'casa-al-mare',
    name: 'Casa al mare',
    emoji: '🏖️',
    members: ['me', 'partner'],
    project: true,
    recurringCategory: 'mutuo',
  },
]

const TRIPS = [
  {
    id: '2025-sicilia',
    emoji: '🍋',
    name: 'Sicilia in macchina',
    members: ['me', 'partner'],
    trip: {
      place: 'Sicilia',
      country: 'Italia',
      year: 2025,
      start: '2025-05-24',
      end: '2025-06-01',
      coords: { lat: 37.6, lon: 14.0, approx: true },
    },
  },
  {
    id: '2025-lofoten',
    emoji: '🇳🇴',
    name: 'Isole Lofoten',
    members: ['me', 'partner'],
    trip: {
      place: 'Lofoten',
      country: 'Norvegia',
      year: 2025,
      start: '2025-08-09',
      end: '2025-08-18',
      coords: { lat: 68.2, lon: 14.0, approx: true },
    },
  },
  {
    id: '2026-lisbona',
    emoji: '🇵🇹',
    name: 'Weekend a Lisbona',
    members: ['me', 'partner'],
    trip: {
      place: 'Lisbona',
      country: 'Portogallo',
      year: 2026,
      start: '2026-03-12',
      end: '2026-03-16',
      coords: { lat: 38.72, lon: -9.14 },
    },
  },
  {
    id: '2026-dolomiti',
    emoji: '⛰️',
    name: 'Dolomiti',
    members: ['me', 'partner'],
    trip: {
      place: 'Dolomiti',
      country: 'Italia',
      year: 2026,
      start: '2026-07-04',
      end: '2026-07-11',
      coords: { lat: 46.4, lon: 11.8, approx: true },
    },
  },
]

const TRICOUNTS = [...BASE_TRICOUNTS, ...TRIPS]

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
    tricount: expense.tricount,
    category: expense.category,
    recurring: expense.recurring ?? false,
  }
  if (expense.subcategory) entry.subcategory = expense.subcategory
  /* Il capitale: rogito, caparra, notaio. Fuori dai conti del mese e dal saldo
     di ogni giorno, e **solo** dentro un progetto. → ADR-0079 */
  if (expense.offBudget) entry.offBudget = true
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
    tricount: 'fisse',
    category: 'casa',
    subcategory: 'affitto',
    recurring: true,
    paidBy: 'me',
  })
  add({
    date: dateOf(month, 5),
    title: 'Spese condominiali',
    amount: 85,
    tricount: 'fisse',
    category: 'casa',
    subcategory: 'bollette',
    recurring: true,
  })
  add({
    date: dateOf(month, 12),
    title: winter ? 'Luce e gas (inverno)' : 'Luce e gas',
    amount: winter ? money(115, 168) : money(52, 84),
    tricount: 'fisse',
    category: 'casa',
    subcategory: 'bollette',
    recurring: true,
  })
  add({
    date: dateOf(month, 8),
    title: 'Internet casa',
    amount: 27.9,
    tricount: 'fisse',
    category: 'casa',
    subcategory: 'bollette',
    recurring: true,
    paidBy: 'partner',
  })
  add({
    date: dateOf(month, 15),
    title: 'Netflix e Spotify',
    amount: 17.98,
    tricount: 'fisse',
    category: 'tempolibero',
    subcategory: 'abbonamenti',
    recurring: true,
  })
  if (['01', '04', '07', '10'].includes(month.slice(5))) {
    add({
      date: dateOf(month, 20),
      title: 'TARI (rata trimestrale)',
      amount: money(58, 72),
      tricount: 'fisse',
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
    tricount: 'personali-alessio',
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
    tricount: 'personali-alessio',
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
      tricount: 'personali-alessio',
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
      tricount: 'personali-alessio',
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
      tricount: 'personali-alessio',
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
      tricount: 'personali-alessio',
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
      tricount: 'personali-alessio',
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
      tricount: 'personali-alessio',
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
      tricount: 'condivise',
      category: 'spesa',
    })
  }
  for (let i = 0; i < intBetween(2, 4); i += 1) {
    add({
      date: dateOf(month, intBetween(1, 28)),
      title: pick(RESTAURANTS),
      amount: money(28, 92),
      tricount: 'condivise',
      category: 'ristoranti',
    })
  }

  // Il gatto: cibo ogni mese, lettiera a mesi alterni, veterinario ogni tanto.
  add({
    date: dateOf(month, intBetween(6, 22)),
    title: pick(['Crocchette e umido', 'Cibo gatto (Arcaplanet)', 'Scatolette e crocchette']),
    amount: money(29, 46),
    tricount: 'condivise',
    category: 'gatto',
    subcategory: 'cibo',
  })
  if (chance(0.55)) {
    add({
      date: dateOf(month, intBetween(4, 26)),
      title: 'Lettiera',
      amount: money(9.5, 15),
      tricount: 'condivise',
      category: 'gatto',
      subcategory: 'lettiera',
    })
  }
  if (chance(0.18)) {
    add({
      date: dateOf(month, intBetween(4, 26)),
      title: pick(['Tiragraffi', 'Giochini', 'Trasportino nuovo', 'Spazzola']),
      amount: money(11, 48),
      tricount: 'condivise',
      category: 'gatto',
      subcategory: 'accessori',
    })
  }
  if (chance(0.35)) {
    add({
      date: dateOf(month, intBetween(6, 24)),
      title: 'Spesa per la casa',
      amount: money(18, 120),
      tricount: 'condivise',
      category: 'casa',
      subcategory: 'arredo',
    })
  }
  if (chance(0.4)) {
    add({
      date: dateOf(month, intBetween(6, 24)),
      title: pick(['Cinema', 'Concerto', 'Mostra', 'Teatro']),
      amount: money(18, 64),
      tricount: 'condivise',
      category: 'tempolibero',
      subcategory: 'spettacoli',
    })
  }
  if (chance(0.35)) {
    add({
      date: dateOf(month, intBetween(6, 24)),
      title: pick(['Treno per Milano', 'Biglietti treno', 'Pedaggi e parcheggio']),
      amount: money(14, 68),
      tricount: 'condivise',
      category: 'trasporti',
      subcategory: pick(['autostrada', 'parcheggi']),
    })
  }
  if (chance(0.22)) {
    add({
      date: dateOf(month, intBetween(6, 24)),
      title: pick(['Regalo compleanno', 'Regalo matrimonio', 'Regalo per i suoi']),
      amount: money(25, 110),
      tricount: 'condivise',
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
    tricount: 'condivise',
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
    tricount: 'condivise',
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
    tricount: 'condivise',
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
    tricount: 'condivise',
    tax730: true,
    notes: 'Controllo per la tiroide. Ricevuta da chiedere di nuovo: la foto è venuta mossa.',
  },
  {
    date: '2026-01-27',
    title: 'Occhiali da vista',
    amount: 310,
    category: 'salute',
    subcategory: 'occhiali',
    tricount: 'personali-alessio',
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
    tricount: 'condivise',
    tax730: true,
    notes: 'Vaccino trivalente più controllo denti.',
  },
  {
    date: '2026-05-06',
    title: 'Fisioterapia (5 sedute)',
    amount: 250,
    category: 'salute',
    subcategory: 'visite',
    tricount: 'personali-alessio',
    split: 'me',
    tax730: true,
  },
  {
    date: '2026-06-19',
    title: 'Analisi cliniche',
    amount: 78,
    category: 'salute',
    subcategory: 'visite',
    tricount: 'personali-alessio',
    split: 'me',
  },
  {
    date: '2026-07-28',
    title: 'Abbonamento annuale mezzi pubblici',
    amount: 330,
    category: 'mezzi',
    tricount: 'personali-alessio',
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
    { title: 'Traghetto e trasferimenti', amount: 138, category: 'viaggi', subcategory: 'trasporti', day: 0 },
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
    { title: 'Tram 28 e metro', amount: 28, category: 'viaggi', subcategory: 'trasporti', day: 2 },
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
      date: shiftDate(trip.trip.start, item.day),
      title: item.title,
      amount: item.amount,
      tricount: trip.id,
      category: item.category,
      subcategory: item.subcategory,
    })
  }
}

// ── Il compartimento personale di lei: poche voci, ma bastano perché il banco
//    di prova mostri la separazione — sul dispositivo di lui non compaiono. ──
const HER = ['Parrucchiere', 'Palestra (lei)', 'Pranzo con le colleghe', 'Libreria']
for (const month of MONTHS) {
  for (let i = 0; i < intBetween(1, 3); i += 1) {
    add({
      date: dateOf(month, intBetween(2, 26)),
      title: pick(HER),
      amount: money(9, 60),
      tricount: 'personali-federica',
      category: pick(['tempolibero', 'ristoranti', 'altro']),
      split: 'partner',
      paidBy: 'partner',
    })
  }
}

expenses.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1))

// ─────────────────────── config ───────────────────────

const config = {
  version: 2,
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
  houseTricount: HOUSE_TRICOUNT,
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
      /* La chiave è l'id del tricount: un tricount per viaggio. → ADR-0037 */
      '2025-sicilia': { since: TODAY, opening: 0, note: 'Saldata, di esempio.' },
    },
  },
  fiscal: {
    deductibleHints: [
      'salute/psicologo',
      'salute/farmacia',
      'salute/visite',
      'salute/occhiali',
      'gatto/veterinario',
    ],
    driveFolderHint: 'Drive → Scontrini 730 → <anno>',
  },
  github: {
    owner: 'Alepazz',
    repo: 'margine',
    branch: 'main',
    dataPath: 'public/data/expenses.json.enc',
    configPath: 'public/data/config.json.enc',
    cardsPath: 'public/data/cards.json.enc',
  },
}

/*
 * ── Il progetto: una casa comprata ──
 *
 * Tre insiemi che si comportano in modo diverso, tutti e tre in questo tricount.
 * È l'esempio che rende visibile ADR-0079: senza, «fuori dai conti del mese»
 * resterebbe una casella che non si vede mai spuntata.
 */

// Il capitale: esce dai conti del mese e dal saldo di ogni giorno.
add({
  date: '2026-04-10',
  title: 'Caparra',
  amount: 12_000,
  tricount: 'casa-al-mare',
  category: 'casa',
  paidBy: 'me',
  offBudget: true,
})
add({
  date: '2026-06-18',
  title: 'Rogito e notaio',
  amount: 8000,
  tricount: 'casa-al-mare',
  category: 'casa',
  paidBy: 'me',
  offBudget: true,
})

// La rata: dentro il mese fra le fisse, dentro il saldo di ogni giorno.
for (const month of ['2026-05', '2026-06', '2026-07', '2026-08']) {
  add({
    date: dateOf(month, 6),
    title: 'Rata del mutuo',
    amount: 640,
    tricount: 'casa-al-mare',
    category: 'mutuo',
    recurring: true,
    paidBy: 'me',
  })
}

// Le altre: spese normali un po' grosse, dentro tutto come qualunque spesa.
add({
  date: '2026-07-22',
  title: 'Frigorifero',
  amount: 720,
  tricount: 'casa-al-mare',
  category: 'casa',
  paidBy: 'me',
})
add({
  date: '2026-08-08',
  title: 'Imbianchino',
  amount: 480,
  tricount: 'casa-al-mare',
  category: 'casa',
  paidBy: 'partner',
})

/* Un rimborso del progetto: serve a far vedere una barra a metà invece che a
   zero, che è il caso in cui si capisce cosa misura. → ADR-0079, ADR-0075 */
const SETTLEMENTS = [
  {
    id: 'rimborso-2026-07-01-a1b2c3',
    date: '2026-07-01',
    from: 'partner',
    to: 'me',
    amount: 4000,
    tricount: 'casa-al-mare',
    note: 'Prima tranche',
  },
]

/**
 * Rilevazioni di prezzo di esempio. → ADR-0041
 *
 * Poche e scelte: tre prodotti su due supermercati inventati, con dentro i tre
 * casi che la pagina deve saper mostrare — un prodotto con **storico** nello
 * stesso supermercato (la passata, scesa da 2,15 a 1,99), uno con una **nota**
 * (il latte in offerta) e uno in **litri** invece che al chilo. Gli id sono
 * scritti a mano: come tutto il resto del seed, due esecuzioni devono dare lo
 * stesso file.
 */
const PRICES = [
  { id: 'prezzo-2026-07-20-a1c3e5', product: 'Passata di pomodoro', store: 'Supermercato A', unit: 'kg', price: 2.15, date: '2026-07-20' },
  { id: 'prezzo-2026-08-02-b2d4f6', product: 'Passata di pomodoro', store: 'Supermercato B', unit: 'kg', price: 1.79, date: '2026-08-02' },
  { id: 'prezzo-2026-08-15-c3e5a7', product: 'Passata di pomodoro', store: 'Supermercato A', unit: 'kg', price: 1.99, date: '2026-08-15' },
  { id: 'prezzo-2026-08-05-d4f6b8', product: 'Caffè macinato', store: 'Supermercato A', unit: 'kg', price: 14.9, date: '2026-08-05' },
  { id: 'prezzo-2026-08-06-e5a7c9', product: 'Caffè macinato', store: 'Supermercato B', unit: 'kg', price: 16.5, date: '2026-08-06' },
  { id: 'prezzo-2026-08-10-f6b8d1', product: 'Latte intero', store: 'Supermercato A', unit: 'l', price: 1.29, date: '2026-08-10' },
  { id: 'prezzo-2026-08-12-a7c9e2', product: 'Latte intero', store: 'Supermercato B', unit: 'l', price: 1.19, date: '2026-08-12' },
  { id: 'prezzo-2026-08-18-b8d1f3', product: 'Latte intero', store: 'Supermercato B', unit: 'l', price: 1.09, date: '2026-08-18', note: 'In offerta' },
]

/**
 * Carte fedeltà di esempio. → ADR-0082
 *
 * Sei, scelte per coprire **tutti i modi in cui una tessera si disegna**: due
 * con la faccia (il caso normale, che senza un'immagine nei dati non si vedrebbe
 * mai), una con il colore ma senza faccia, una senza né l'una né l'altro, e una
 * senza codice a barre — quelle che alla cassa si danno a voce. I formati sono
 * quattro diversi di proposito: un EAN-13, un Code 128 con le lettere, un Code
 * 39 e un ITF.
 *
 * I nomi sono inventati come tutto il resto del seed: il repo è pubblico, e i
 * negozi in cui due persone fanno la spesa sono roba loro (→ ADR-0067).
 *
 * La cifra di controllo la calcola `eanChecksum` invece di essere scritta a
 * mano: sbagliata, la validazione rifiuterebbe di pubblicare i dati di esempio.
 */
const ean13 = (twelve) => `${twelve}${eanChecksum(twelve)}`

const CARDS = [
  {
    id: 'carta-2026-08-01-1a2b3c4d',
    name: 'Supermercato A',
    code: ean13('204700112233'),
    format: 'ean13',
    image: cardFaceDataUri('#1d4ed8'),
    color: '#1d4ed8',
    note: 'Numero cliente 4471',
    addedAt: '2026-08-01',
  },
  {
    id: 'carta-2026-08-01-2b3c4d5e',
    name: 'Supermercato B',
    code: ean13('204700998877'),
    format: 'ean13',
    image: cardFaceDataUri('#b91c1c'),
    color: '#b91c1c',
    addedAt: '2026-08-01',
  },
  {
    id: 'carta-2026-08-02-3c4d5e6f',
    name: 'Libreria C',
    code: 'LC-4471-XZ',
    format: 'code128',
    image: cardFaceDataUri('#15803d'),
    color: '#15803d',
    addedAt: '2026-08-02',
  },
  {
    id: 'carta-2026-08-02-4d5e6f70',
    name: 'Ferramenta D',
    code: 'FD447102',
    format: 'code39',
    color: '#b45309',
    addedAt: '2026-08-02',
  },
  {
    id: 'carta-2026-08-05-5e6f7081',
    name: 'Palestra E',
    code: '10029384756612',
    format: 'itf',
    addedAt: '2026-08-05',
  },
  {
    id: 'carta-2026-08-11-6f708192',
    name: 'Farmacia F',
    code: '333 1234567',
    format: 'text',
    note: 'Alla cassa basta il numero di telefono',
    addedAt: '2026-08-11',
  },
]

const cards = {
  version: 1,
  updatedAt: `${TODAY}T09:00:00.000Z`,
  cards: CARDS,
}

const dataset = {
  version: 2,
  updatedAt: `${TODAY}T09:00:00.000Z`,
  expenses,
  tricounts: TRICOUNTS,
  /* I rimborsi di ogni giorno si registrano dall'app e partono da zero; quello
     del progetto c'è, perché una barra dei rimborsi a zero non mostra niente. */
  settlements: SETTLEMENTS,
  prices: PRICES,
}

writeJson(`${PATHS.dataExample}/expenses.json`, dataset)
writeJson(`${PATHS.dataExample}/config.json`, config)
writeJson(`${PATHS.dataExample}/cards.json`, cards)
log(
  `✓ Dati di esempio: ${expenses.length} spese, ${TRICOUNTS.length} tricount, ` +
    `${PRICES.length} prezzi rilevati, ${CARDS.length} carte in data-example/`,
)

if (!exists(PATHS.expenses)) {
  writeJson(PATHS.expenses, dataset)
  writeJson(PATHS.config, config)
  writeJson(PATHS.cards, cards)
  log('✓ Copiati anche in data/ (era vuota)')
} else {
  log('· data/ contiene già dei dati: lasciata intatta')
}
