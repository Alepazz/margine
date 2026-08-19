/**
 * Converte gli export JSON dei tricount in file per `data/incoming/`.
 *
 * Gli export di Tricount hanno data, descrizione, chi ha pagato, totale e la
 * quota di ogni membro. Mancano due cose: l'origine (quale tricount è) e la
 * categoria — il campo `category` di Tricount è OTHER o UNCATEGORIZED nel 41%
 * delle voci, quindi la categoria si ricava dalla descrizione. Le regole stanno
 * in `RULES`: la prima che combacia vince, quindi l'ordine è significativo.
 *
 *   node scripts/from-tricount.mjs            → scrive data/incoming/
 *   node scripts/from-tricount.mjs --dry-run  → stampa solo il riepilogo
 *
 * Poi si prosegue con `npm run import`, che fonde, valida e cifra.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { PATHS, exists, fail, log } from './lib/io.mjs'

const RAW_DIR = join(PATHS.data, 'raw')

/** I nomi con cui comparite negli export: cambiano da un tricount all'altro. */
const ME = new Set(['Ale', 'Alepazz'])
const PARTNER = new Set(['Rica', 'Fede'])

/**
 * Un file per tricount. `trip` presente = tricount di vacanza, e ogni tricount
 * di vacanza è un viaggio solo: le date vengono dal grappolo di spese sul posto,
 * non dal primo pagamento (voli e hotel si prenotano mesi prima).
 */
const TRICOUNTS = [
  { file: 'spese_casa_expenses.json', source: 'fisse' },
  { file: 'personale_expenses.json', source: 'personali' },
  { file: 'perché_non_sono_ric(c)a_expenses.json', source: 'condivise' },
  { file: 'germania🇩🇪_expenses.json', source: 'vacanze', trip: 'germania-2024' },
  { file: 'parigi_expenses.json', source: 'vacanze', trip: 'parigi-2025' },
  { file: 'ortona_expenses.json', source: 'vacanze', trip: 'ortona-2025' },
  { file: 'vacanze_cretine_expenses.json', source: 'vacanze', trip: 'creta-2025' },
  { file: '🍕sud_italia_expenses.json', source: 'vacanze', trip: 'sud-italia-2026' },
]

const TRIPS = [
  {
    id: 'germania-2024',
    name: 'Germania',
    place: 'Germania',
    country: 'Germania',
    year: 2024,
    start: '2024-10-26',
    end: '2024-10-28',
  },
  {
    id: 'parigi-2025',
    name: 'Parigi',
    place: 'Parigi',
    country: 'Francia',
    year: 2025,
    start: '2025-04-26',
    end: '2025-05-01',
  },
  {
    id: 'ortona-2025',
    name: 'Ortona',
    place: 'Ortona',
    country: 'Italia',
    year: 2025,
    start: '2025-07-21',
    end: '2025-07-23',
  },
  {
    id: 'creta-2025',
    name: 'Creta',
    place: 'Creta',
    country: 'Grecia',
    year: 2025,
    start: '2025-08-17',
    end: '2025-08-25',
  },
  {
    id: 'sud-italia-2026',
    name: 'Sud Italia',
    place: 'Campania e Calabria',
    country: 'Italia',
    year: 2026,
    start: '2026-07-15',
    end: '2026-07-24',
  },
]

/**
 * Spese pagate col welfare aziendale, dichiarate a mano (→ ADR-0014).
 *
 * Normalmente il flag si mette dall'app, come il tag 730: nel dato non c'è niente
 * che distingua un albergo pagato col welfare da uno pagato con la carta. Questa
 * lista esiste solo per il **primo import**, che ha portato dentro venti mesi di
 * storia quando il repo non era ancora pubblicato e le annotazioni non avevano
 * dove essere salvate. Le voci nuove si segnano dall'app.
 *
 * Le tasse di soggiorno restano fuori: si pagano in loco.
 */
const WELFARE = [
  { trip: 'sud-italia-2026', title: 'Hotel Residenza del Duca' },
  { trip: 'sud-italia-2026', title: 'Hotel Tropea' },
  { trip: 'sud-italia-2026', title: 'Notte Napoli' },
  { trip: 'sud-italia-2026', title: 'Hotel Marco' },
]

// ─────────────────────────── regole di categoria ───────────────────────────
// [regex, categoria, sottocategoria, ricorrente?] — vince la prima che combacia.
//
// L'ordine risolve le ambiguità reali: «Benzina sci» è carburante, non sport, e
// «Pranzo sci» è un pranzo — quindi trasporti e cibo stanno prima dello sport.
// «Cibo Gian» è il gatto, quindi il gatto sta prima del cibo.

const RULES = [
  // ── casa ──
  [/\baffitto\b/, 'casa', 'affitto', true],
  [/bolletta|energia elettrica|\bmetano\b|conguaglio|\btari\b|condominio/, 'casa', 'bollette', true],
  [/fattura tim|modem/, 'telefonia', null, true],
  [/ricarica (telefon|tim)|ricarica telefonica/, 'telefonia', null],
  [
    /caldaia|condizionatore|lavastoviglie|tecnico|lavandino|tanica|tubo terrazzo|zanzariera|lampadin|esca formiche|chiave inglese/,
    'casa',
    'manutenzione',
  ],
  [
    /ikea|kasanova|scrivania|pouf|sdraio|coperte|piatti|tazzine|padellino|oliera|portafrutta|cornice|lampada|bilancia|\bphon\b|scatole|contenitore|serra piantine|giardinaggio|telo esterno|secchi|\bletto\b|rumba|videocamere|pellicola|accappatoio|beccucci|filtri brita|spazzole|buste per friggitrice|attrezzo smash|kit sushi|swiffer|\bserra\b/,
    'casa',
    'arredo',
  ],
  [/valeria/, 'casa', 'domestico'],
  [/detersiv|prodotti lavastoviglie|dentifricio|finish|sapone|\bdm\b/, 'casa', 'prodotti'],

  // ── il gatto (prima del cibo: «Cibo Gian» e «Crocchette» sono sue) ──
  [/crocchett|cibo umido|cibo gian|pappa gatto|arcaplanet|crazy cat/, 'gatto', 'cibo'],
  [/veterinari|castrazione|antibiotico|antipulci|allerpet/, 'gatto', 'veterinario'],
  [/lettiera|sabbietta/, 'gatto', 'lettiera'],
  [
    /tiragraffi|taglia unghie|dispenser gatto|gioco cane|\bil gatto\b|verdicchio|\bgian\b/,
    'gatto',
    'accessori',
  ],

  // ── salute ──
  [/psicolog/, 'salute', 'psicologo'],
  [
    /farmacia|medicin|\bmedice\b|brufen|benactiv|antinfiammator|arnica|pomata|travelgum|\bbite\b/,
    'salute',
    'farmacia',
  ],
  [/visita|tampone|\braggi\b|analisi|dentist/, 'salute', 'visite'],
  [/lenti a contatto|occhiali/, 'salute', 'occhiali'],
  [/barbiere|parrucchier|estetista/, 'salute', 'cura'],

  // ── trasporti (prima dello sport e del cibo) ──
  [/benzina|carburante|rifornimento|gasolio/, 'trasporti', 'carburante'],
  [/autostrada|pedagg|unipolmove|telepass/, 'trasporti', 'autostrada'],
  [
    /parcheggi|easy ?park|autolavaggio|lavaggio auto|abbonamento.*(auto|parcheggio)/,
    'trasporti',
    'parcheggi',
    true,
  ],
  [/assicurazione|bollo auto|revisione|gomme|olio motore|tergicristall|\bmulta\b/, 'trasporti', 'auto'],
  [/\btreno\b|\btreni\b|biglietti? treno|biglietto pesaro|\btaxi\b|\btrasporto\b/, 'trasporti', 'mezzi'],

  // ── viaggio pagato di tasca propria, fuori dal tricount di gruppo ──
  // Restano spese personali (contano nel mese), ma la categoria dice cos'erano.
  [/casa creta/, 'viaggi', 'alloggio'],
  [/\bcreta\b/, 'viaggi', 'attivita'],

  // ── spesa alimentare ──
  [
    /gigante|esselunga|conad|carrefour|\bunes\b|\bcoop\b|tigros|\blidl\b|\bpac\b|mercato|macelleria|pasta fresca|salami|panettoni|tortellini|\bpollo\b|formaggi|olive|\bpane\b|frutta|verdura|yogurt|biscott|sottilette|\bcarne\b|ravioli|\bcrudo\b|\bspesa\b|supermercato|toogoodtogo|\bvino\b|\bvini\b|\bgin\b|noccioline|patatine|estathe|spaccio|calendario avvento|\bcibo\b|\bforno\b|affettato|\buov[ao]\b|kinder/,
    'spesa',
    null,
  ],

  // ── bar e ristoranti ──
  [/colazione|\bcaff|cappuccin|brioche/, 'ristoranti', 'colazione'],
  [
    /pranzo|piadina|panini|kebab|\bmc\b|mcdonald|burger king|\bkfc\b|hamburger|\bpok|tacos|autogrill/,
    'ristoranti',
    'pranzo',
  ],
  [
    /\bcena\b|pizza|pizze|sushi|susci|grigliata|pappardelle|arrosticini|vongole|tigella|smash burger|capodanno/,
    'ristoranti',
    'cena',
  ],
  [
    /aperitivo|apericena|\bbirra\b|\bbirre\b|\bdrink\b|spritz|cocktail|\bhugo\b|bevuta|prosecco|coca ?cola/,
    'ristoranti',
    'aperitivi',
  ],
  [
    /gelato|granita|tartufo|sbrisolona|\bdolci\b|dolcetti|dolcì|pasticcini|crostata|merenda|\bdolce\b/,
    'ristoranti',
    'gelato',
  ],
  [/glovo|deliveroo|just eat/, 'ristoranti', 'consegna'],

  // ── tempo libero ──
  [
    /padel|tennis|calcetto|beach volley|\bbeach\b|palestra|borsone|\btorneo\b|skipass|maestro sci|noleggio sci|robe sci|calze sci|maglie termiche|\bsci\b|sciare|trekking|\bcai\b|\bbici\b|rugby|beer pong/,
    'tempolibero',
    'sport',
  ],
  [
    /manga|one ?piece|hunter x hunter|yamato|luffy|\bace\b|\bzoro\b|buggy|\bcarte\b|espositore|bustine|action figure|\bfigure\b/,
    'tempolibero',
    'manga',
  ],
  [/hades|silksong|hollow knight|elden ring|gta6|expedition 33/, 'tempolibero', 'videogiochi'],
  [
    /ticket to ride|7 wonders|exploding kittens|villa[in]*nous|gioco da tavol|puzzle|norferville|catastrofica visita|tombola|schedina/,
    'tempolibero',
    'tavolo',
  ],
  [
    /vinile|\blibro\b|\blibri\b|libreria|manifesto|enigmistica|stampe/,
    'tempolibero',
    'musica',
  ],
  [/spotify|netflix|disney|\bhbo\b|amazon prime|abbonamento amazon|whiffable/, 'tempolibero', 'abbonamenti', true],
  [/cinema|popcorn|challengers|concerto|caparezza|zalone/, 'tempolibero', 'spettacoli'],
  [/gardacon|gardacom|\blucca\b|fiera|champions|bologna in/, 'tempolibero', 'fiere'],

  // ── regali (dopo il cibo: «Cena compleanno» è una cena) ──
  [/regal|\bfiori\b|bomboniera|san valentino|befana|compleanno|natal|pasqua|donazione/, 'regali', null],

  // ── il resto ──
  [/iphone|caricatore|\bmouse\b|cuffie|monitor|tastiera|hard disk|aliexpress|\bcover\b/, 'tecnologia', null],
  [
    /maglione|camicia|pantalon|scarpe|mutande|\bmaglia\b|\bmaglie\b|calze|ciabatte|zaino|giacca|costume/,
    'abbigliamento',
    null,
  ],
  [/\b730\b|commercialista|carta d.identit|patente|bollettini|\bf24\b/, 'burocrazia', null],
  [
    /\bbar\b|\bpub\b|bistr|osteria|trattoria|ristorante|\bippo\b|fishham|\bdina\b|alto e savio|\bcarro\b|celestino|cesano|pozzo|piramidi|leoni|bruna|ca de rat|carrobiolo|clandestino|fuorimano|magna calabra|casa grimaldi|city ?pub|nottingham|capannina|tajamare|fumagalli|feeddy|cinigalese|assaje|fiorillo|sagra|vigevano|legnano|arona|mantova|pesce azzurro|alicepizza|skizzo|tranquilli|lullo|villa reale monza|bonazze|marca dei sapori|guerro|viganò|piano b|\bsera\b|serata/,
    'ristoranti',
    null,
  ],
]

/** Nelle vacanze la categoria è sempre `viaggi`: cambia la sottocategoria. */
const TRIP_RULES = [
  [
    /hotel|\bcasa\b|camera|\bnotte\b|alloggio|residenza|b&b|prenotazion|tassa di soggiorno|tassa soggiorno/,
    'alloggio',
  ],
  /* Ristoranti riconoscibili solo dal nome: «Volta del Fuenti» è stellato, non un albergo. */
  [/volta del fuenti|magna calabra|clandestino/, 'cibo'],
  [
    /voli|\bvolo\b|aereo|benzina|autostrada|pedagg|parcheggi|traghetto|\btaxi\b|\btreni\b|\btreno\b|noleggio auto|anticipo noleggio|metro|ascensore|\bbus\b|navetta/,
    'trasporti',
  ],
  [
    /museo|torre eiffel|versailles|cnosso|knosso|guida|biglietti|\bgita\b|barca|ombrellon|noleggio bici|napoli sotterranea|cristo velato|cripta|castel|chiesa|odissea|gramvousa|balos|\bpalla\b|\bcampi\b|elafonis|ελαφον|zoo/,
    'attivita',
  ],
  [
    /quadro|calamita|peperoncino|souvenir|cartolina|regal|tovagliette|zucche|enigmistica|anfora|macarons/,
    'souvenir',
  ],
  [
    /colazione|\bcaff|pranzo|\bcena\b|gelato|aperitivo|\bbirr|\bdrink\b|acqua|limonata|aranciata|granita|pizza|panini|\bspesa\b|supermercato|conad|lidl|\bab\b|cocco|caramelle|tartufo|cuoppo|cuppo|copa de dora|arrosticini|pesce|hamburger|burger king|\bmagna\b|\bvino\b|torta|\bdolc|pasticc|crudo|kebab|\bmc\b|sbrisolona|pane/,
    'cibo',
  ],
]

// ─────────────────────────── conversione ───────────────────────────

const cents = (value) => Math.round(value * 100)

function classify(description, isTrip) {
  const text = description.toLowerCase()
  if (isTrip) {
    for (const [pattern, sub] of TRIP_RULES) {
      if (pattern.test(text)) return { category: 'viaggi', subcategory: sub, recurring: false }
    }
    return { category: 'altro', subcategory: undefined, recurring: false }
  }
  for (const [pattern, category, subcategory, recurring] of RULES) {
    if (pattern.test(text)) {
      return { category, subcategory: subcategory ?? undefined, recurring: recurring === true }
    }
  }
  return { category: 'altro', subcategory: undefined, recurring: false }
}

/** Le quote dei terzi si sommano in un unico totale anonimo. */
function sharesOf(entry) {
  let me = 0
  let partner = 0
  let others = 0
  for (const [name, value] of Object.entries(entry.shares ?? {})) {
    if (ME.has(name)) me += cents(value)
    else if (PARTNER.has(name)) partner += cents(value)
    else others += cents(value)
  }
  const shares = { me: me / 100, partner: partner / 100 }
  if (others > 0) shares.others = others / 100
  return shares
}

function payerOf(entry) {
  if (ME.has(entry.paid_by)) return 'me'
  if (PARTNER.has(entry.paid_by)) return 'partner'
  return 'others'
}

function hash8(text) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function main() {
  const dryRun = process.argv.includes('--dry-run')

  if (!exists(RAW_DIR)) {
    fail(`Manca ${RAW_DIR}: mettici gli export JSON dei tricount.`)
    return
  }

  const present = new Set(readdirSync(RAW_DIR))
  const missing = TRICOUNTS.filter((t) => !present.has(t.file)).map((t) => t.file)
  if (missing.length > 0) {
    fail(`Export non trovati in data/raw/: ${missing.join(', ')}`)
    return
  }

  /** Contatore per le voci gemelle: stessa data, stesso titolo, stesso importo. */
  const seen = new Map()
  const byTricount = []
  let converted = 0
  let welfareMarked = 0
  const unmatched = []

  for (const tricount of TRICOUNTS) {
    const raw = JSON.parse(readFileSync(join(RAW_DIR, tricount.file), 'utf8'))
    const isTrip = tricount.source === 'vacanze'
    const expenses = []

    for (const entry of raw) {
      const title = String(entry.description ?? '').trim()
      const { category, subcategory, recurring } = classify(title, isTrip)
      if (category === 'altro') unmatched.push({ file: tricount.file, title, total: entry.total })

      const base = `${entry.date}|${title}|${entry.total}|${tricount.source}`
      const twin = seen.get(base) ?? 0
      seen.set(base, twin + 1)

      const paidBy = payerOf(entry)
      /* Il welfare è di chi anticipa: su un conto pagato da altri non vuol dire niente. */
      const welfare =
        paidBy !== 'others' &&
        WELFARE.some((w) => w.trip === tricount.trip && w.title === title)

      expenses.push({
        id: `${entry.date}-${hash8(base)}${twin > 0 ? `-${twin}` : ''}`,
        date: entry.date,
        title,
        amount: entry.total,
        shares: sharesOf(entry),
        paidBy,
        source: tricount.source,
        category,
        ...(subcategory ? { subcategory } : {}),
        recurring,
        ...(tricount.trip ? { trip: tricount.trip } : {}),
        ...(welfare ? { welfare: true } : {}),
      })
      if (welfare) welfareMarked += 1
      converted += 1
    }

    expenses.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1))
    byTricount.push({ tricount, expenses })
  }

  log(`Convertite ${converted} voci da ${TRICOUNTS.length} tricount.`)
  if (welfareMarked !== WELFARE.length) {
    log(
      `⚠ segnate welfare ${welfareMarked} voci su ${WELFARE.length} dichiarate: ` +
        'un titolo della lista WELFARE non combacia con nessuna spesa.',
    )
  } else {
    log(`Segnate come pagate col welfare: ${welfareMarked}`)
  }
  log(`Senza categoria (finite in «altro»): ${unmatched.length}`)
  for (const item of unmatched) {
    log(`  · ${item.title} (${item.total} €) — ${item.file}`)
  }

  if (dryRun) {
    log('')
    log('--dry-run: non ho scritto niente.')
    return
  }

  mkdirSync(PATHS.incoming, { recursive: true })
  for (const { tricount, expenses } of byTricount) {
    const name = tricount.trip ?? tricount.source
    const payload = { expenses, ...(tricount.trip ? { trips: TRIPS.filter((t) => t.id === tricount.trip) } : {}) }
    const target = join(PATHS.incoming, `${name}.json`)
    writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    log(`→ ${target} (${expenses.length} voci)`)
  }

  log('')
  log('Ora: npm run import')
}

try {
  main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
