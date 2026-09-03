/**
 * Porta le carte fedeltà da un'altra app a Margine, leggendone gli screenshot.
 *
 * **Perché dagli screenshot e non dalle tessere di plastica.** I codici a barre
 * *disegnati* da un'app si rileggono senza incertezze; è sulle foto di plastica
 * con i riflessi che i decodificatori software faticano — su un banco di prova
 * indipendente, zxing legge circa il 78 % degli EAN-13 e il 32 % dei Code 128
 * fotografati, contro la totalità di quelli disegnati. E alcune tessere fisiche
 * non ci sono più: la sorgente vera è l'app in cui sono state digitalizzate.
 *
 * **Cosa gli si dà.** Una cartella per carta sotto `data/incoming/cards/`, dove
 * il nome della cartella diventa il nome del negozio (si corregge poi dall'app):
 *
 *     data/incoming/cards/
 *       supermercato-a/
 *         codice.png     ← la schermata con il codice a barre grande
 *         tessera.png     ← facoltativa: il ritaglio della tessera dalla griglia
 *
 * `data/` è fuori da git, quindi gli screenshot non finiscono nel repo — che è
 * pubblico, e uno screenshot di una carta fedeltà porta il numero in chiaro.
 *
 * **Cosa ne esce.** `data/cards.json`, che `npm run encrypt` pubblica cifrato.
 * Le carte già presenti nel file **non si toccano**: lo script aggiunge, non
 * sostituisce, così rilanciarlo dopo aver corretto un nome dall'app non annulla
 * la correzione.
 *
 * → ADR-0082, ADR-0083
 */

import { randomBytes } from 'node:crypto'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { edgeColor } from './lib/card-color.mjs'
import { PATHS, exists, fail, log, readJson, writeJson } from './lib/io.mjs'
import { MAX_IMAGE_CHARS, validateCards } from './lib/validate-core.mjs'

const INCOMING = join(PATHS.incoming, 'cards')

/**
 * Come zxing nomina i formati, e come li chiamiamo noi. Senza trattini: è la
 * grafia che `readBarcodes` restituisce davvero, la stessa che il test del giro
 * completo (`barcode-roundtrip.test.mjs`) confronta a ogni esecuzione.
 */
const FORMAT_OF = {
  EAN13: 'ean13',
  EAN8: 'ean8',
  Code128: 'code128',
  Code39: 'code39',
  ITF: 'itf',
  QRCode: 'qr',
}

/** Quanto larga si conserva la faccia: come nel browser. */
const FACE_WIDTH = 400

function slugToName(slug) {
  return slug
    .split('-')
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ')
}

/**
 * Un id nuovo, come lo scrive l'app.
 *
 * **Non si prova a renderlo stabile**, e la prima versione ci ha provato
 * sbagliando: impastava la data nell'id e poi si fidava di `known.has(id)` per
 * non fare doppioni, così rilanciare lo script **il giorno dopo** — con le
 * cartelle ancora al loro posto, che è il caso normale — riaggiungeva ogni
 * carta. E la validazione non lo vedeva: id diversi, e lo stesso codice è solo
 * un avviso.
 *
 * L'identità di una carta è il suo **codice**, non il nome della cartella e
 * ancora meno il giorno in cui l'hai importata. È quello che si confronta, dopo
 * averlo letto.
 */
function newId(today) {
  const bytes = randomBytes(4).toString('hex')
  return `carta-${today}-${bytes}`
}

/**
 * Il colore della fascia, letto dalla faccia ridotta a quaranta pixel di
 * larghezza — la stessa misura che usa l'app nel canvas. Il conteggio vero sta
 * in `lib/card-color.mjs`, che ha il suo gemello in `src/data/card-image.ts`.
 */
async function dominantColor(sharp, buffer) {
  const width = 40
  const { data, info } = await sharp(buffer)
    .resize({ width, fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return edgeColor(data, info.width, info.height)
}

/** La faccia come data URI: si prova PNG e JPEG e vince il più piccolo. */
async function face(sharp, buffer) {
  const base = sharp(buffer).resize({ width: FACE_WIDTH, withoutEnlargement: true }).flatten({
    background: '#ffffff',
  })
  for (const quality of [82, 70, 58]) {
    const [png, jpeg] = await Promise.all([
      base.clone().png({ compressionLevel: 9 }).toBuffer(),
      base.clone().jpeg({ quality }).toBuffer(),
    ])
    const smaller = png.length <= jpeg.length ? { buffer: png, mime: 'png' } : { buffer: jpeg, mime: 'jpeg' }
    const uri = `data:image/${smaller.mime};base64,${smaller.buffer.toString('base64')}`
    if (uri.length <= MAX_IMAGE_CHARS) return uri
  }
  return undefined
}

try {
  if (!exists(INCOMING)) {
    throw new Error(
      `Non trovo ${INCOMING}. Crea una cartella per carta, con dentro codice.png ` +
        '(la schermata col codice a barre) e, se ce l’hai, tessera.png (il ritaglio della tessera).',
    )
  }

  /* Importate a richiesta: sono dipendenze di sviluppo, e chi non fa la
     migrazione non deve pagarne il caricamento. */
  const sharp = (await import('sharp')).default
  const { prepareZXingModule, readBarcodes } = await import('zxing-wasm/reader')
  const wasm = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm', import.meta.url)),
  )
  prepareZXingModule({ overrides: { wasmBinary: wasm }, fireImmediately: true })

  const today = new Date().toISOString().slice(0, 10)
  const file = exists(PATHS.cards)
    ? readJson(PATHS.cards)
    : { version: 1, updatedAt: new Date().toISOString(), cards: [] }
  /* Per **codice**, che è l'identità vera di una carta: così rilanciare lo
     script non raddoppia niente, nemmeno domani, nemmeno se la cartella è
     stata rinominata. */
  const known = new Map(file.cards.map((card) => [String(card.code).trim(), card.name]))

  const slugs = readdirSync(INCOMING).filter((entry) => statSync(join(INCOMING, entry)).isDirectory())
  if (slugs.length === 0) throw new Error(`In ${INCOMING} non ci sono cartelle.`)

  let added = 0
  let skipped = 0
  const problems = []

  for (const slug of slugs.sort()) {
    const dir = join(INCOMING, slug)
    const name = slugToName(slug)

    const codePath = ['codice.png', 'codice.jpg', 'codice.jpeg', 'codice.PNG']
      .map((candidate) => join(dir, candidate))
      .find(exists)
    if (codePath === undefined) {
      problems.push(`${name}: manca codice.png (la schermata col codice a barre).`)
      continue
    }

    const { data, info } = await sharp(codePath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const found = await readBarcodes(
      {
        data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
        width: info.width,
        height: info.height,
      },
      { tryHarder: true, maxNumberOfSymbols: 2 },
    )
    const hit = found[0]
    if (hit === undefined) {
      problems.push(
        `${name}: nessun codice a barre riconosciuto in ${codePath}. ` +
          'Ritaglia lo screenshot sul codice, oppure aggiungi la carta a mano dall’app.',
      )
      continue
    }
    /*
     * **Due codici diversi nello stesso screenshot: si rinuncia.** Le app di
     * tessere mostrano spesso barre **e** QR nella stessa schermata, e prendere
     * il primo che capita vuol dire scrivere nel dato un codice scelto a caso —
     * che è la cosa peggiore, perché non lascia traccia e si scopre alla cassa.
     */
    const distinti = new Set(found.map((r) => r.text))
    if (distinti.size > 1) {
      problems.push(
        `${name}: nello screenshot ci sono ${distinti.size} codici diversi. ` +
          'Ritaglialo su quello giusto, così non lo scelgo io.',
      )
      continue
    }
    const format = FORMAT_OF[hit.format]
    if (format === undefined) {
      problems.push(`${name}: formato «${hit.format}», che l’app non sa ancora disegnare.`)
      continue
    }

    const already = known.get(hit.text.trim())
    if (already !== undefined) {
      log(`· ${name}: questo codice c'è già come «${already}», lasciata com'è`)
      skipped += 1
      continue
    }

    const tesseraPath = ['tessera.png', 'tessera.jpg', 'tessera.jpeg']
      .map((candidate) => join(dir, candidate))
      .find(exists)

    const card = { id: newId(today), name, code: hit.text, format, addedAt: today }
    if (tesseraPath !== undefined) {
      const buffer = await sharp(tesseraPath).toBuffer()
      const uri = await face(sharp, buffer)
      if (uri === undefined) {
        problems.push(`${name}: la tessera resta troppo grande anche rimpicciolita, saltata.`)
      } else {
        card.image = uri
        const color = await dominantColor(sharp, buffer)
        if (color !== undefined) card.color = color
      }
    }

    file.cards.push(card)
    known.set(hit.text.trim(), name)
    added += 1
    /* Il numero **non** si stampa: finisce nei log e nella cronologia del
       terminale, e un numero di carta fedeltà è un dato personale come una
       spesa. Si stampa quanto è lungo, che è ciò che serve a controllare. */
    log(
      `✓ ${name}: ${format}, ${hit.text.length} caratteri` +
        (card.image ? `, faccia ${Math.round(card.image.length / 1024)} kB` : ', senza faccia'),
    )
  }

  file.updatedAt = new Date().toISOString()

  const { errors, warnings } = validateCards(file)
  for (const warning of warnings) log(`⚠ ${warning}`)
  if (errors.length > 0) {
    for (const error of errors) log(`✗ ${error}`)
    throw new Error('Carte non valide: niente è stato scritto.')
  }

  writeJson(PATHS.cards, file)
  log('')
  log(`✓ data/cards.json — ${file.cards.length} carte (${added} nuove, ${skipped} già presenti)`)
  for (const problem of problems) log(`⚠ ${problem}`)
  log('')
  log('Ora: npm run encrypt')
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
