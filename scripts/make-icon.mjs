/**
 * Genera **tutte** le icone di Giano, da una sola descrizione geometrica.
 *
 * Il marchio sono due G specchiate e fuse, e il trattino di ciascuna è una
 * mandorla: l'occhio socchiuso del dio che guarda avanti e indietro. Ardesia la
 * faccia che guarda al passato, carta quella che guarda al futuro, rossi i due
 * occhi, su un fondo navy. → ADR-0093
 *
 * **Perché la matematica e non un convertitore.** Su questo Mac non c'è un
 * SVG→PNG installato, e non lo si aggiunge: `sharp` è un binario nativo che sta
 * nel progetto solo per l'import delle carte, e Chrome headless renderebbe la
 * generazione dell'icona dipendente da un browser installato. Le due forme che
 * servono si sanno scrivere come disuguaglianze — una corona circolare tagliata
 * a un angolo, e l'intersezione di due dischi — quindi si rasterizzano
 * direttamente, con quattro campioni per lato che fanno l'antialiasing.
 *
 * **La mandorla è l'intersezione di due cerchi, non una curva di Bézier.** È la
 * scelta che tiene `public/favicon.svg` e questo file d'accordo: un arco di
 * cerchio l'SVG lo sa disegnare e questo file lo sa calcolare, una quadratica no
 * — e due forme *quasi* uguali fra il vettoriale e il PNG sarebbero un difetto
 * che si vede solo affiancandoli.
 *
 * **Il marchio è scalato a 0.9** perché le icone dell'app sono *maskable*: a
 * piena misura arriva a 43.5 unità dal centro, e una maschera tonda ritaglia a
 * 40 — le punte degli anelli sarebbero tagliate su Android.
 *
 * Cosa scrive, e perché ognuna serve:
 *   icon-1024.png            il master, per quando servirà una misura nuova
 *   icon-512.png             manifest, e ripiego di apple-touch
 *   icon-192.png             manifest, misura di Android
 *   apple-touch-icon.png     iOS, 180px: quadrato pieno, la maschera la mette lui
 *   favicon-32.png · -16.png i ripieghi per chi non legge l'SVG
 *   favicon.ico              Safari vecchi e i lettori di feed: 16, 32 e 48 dentro
 * Il vettoriale `public/favicon.svg` è scritto a mano e non si genera: è la
 * fonte del disegno. La geometria sta in `lib/icon-geometry.mjs`, che è
 * importabile senza scrivere niente — qui invece si scrive, quindi un test
 * non potrebbe caricare questo file: `lib/icon-parity.test.mjs` confronta
 * quel modulo col vettoriale.
 */

import { writeFileSync } from 'node:fs'

import { colorAt } from './lib/icon-geometry.mjs'
import { PATHS, ensureDir, log } from './lib/io.mjs'
import { png } from './lib/png.mjs'

/** Un PNG quadrato, con 4×4 campioni per pixel. */
function render(size, { rounded = false } = {}) {
  const N = 4
  return png(
    size,
    size,
    (px, py) => {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < N; sy += 1) {
        for (let sx = 0; sx < N; sx += 1) {
          const x = ((px + (sx + 0.5) / N) / size) * 100
          const y = ((py + (sy + 0.5) / N) / size) * 100
          const c = colorAt(x, y, { rounded })
          if (c === null) continue
          r += c[0]
          g += c[1]
          b += c[2]
          a += 255
        }
      }
      const n = N * N
      /* Media dei soli campioni dentro la sagoma: dividere per `n` scurirebbe
         il bordo verso il nero invece di renderlo trasparente. */
      const dentro = a / 255
      if (dentro === 0) return [0, 0, 0, 0]
      return [Math.round(r / dentro), Math.round(g / dentro), Math.round(b / dentro), Math.round(a / n)]
    },
    { alpha: true },
  )
}

/**
 * Un ICO con dentro dei PNG.
 *
 * Il formato è una direttoria di sei parole per immagine più i dati in fila;
 * `width`/`height` sono un byte solo, e 0 vuol dire 256. I payload PNG li
 * accettano tutti i browser che contano ancora un `.ico`.
 */
function ico(entries) {
  const head = Buffer.alloc(6)
  head.writeUInt16LE(0, 0) // riservato
  head.writeUInt16LE(1, 2) // 1 = icona
  head.writeUInt16LE(entries.length, 4)

  let offset = 6 + entries.length * 16
  const dir = []
  for (const { size, data } of entries) {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0)
    e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt8(0, 2) // colori della palette: nessuna
    e.writeUInt8(0, 3) // riservato
    e.writeUInt16LE(1, 4) // piani
    e.writeUInt16LE(32, 6) // bit per pixel
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    dir.push(e)
    offset += data.length
  }
  return Buffer.concat([head, ...dir, ...entries.map((x) => x.data)])
}

// ── Scrittura ──
ensureDir(`${PATHS.root}/public`)

/* Le icone dell'app sono **quadrati pieni**: la maschera la mette il sistema, e
   un angolo trasparente su iOS diventa bianco. Le favicon invece sono stondate
   da noi, perché nella linguetta del browser nessuno le maschera. */
const FILES = [
  ['icon-1024.png', 1024, {}],
  ['icon-512.png', 512, {}],
  ['icon-192.png', 192, {}],
  ['apple-touch-icon.png', 180, {}],
  ['favicon-32.png', 32, { rounded: true }],
  ['favicon-16.png', 16, { rounded: true }],
]

for (const [name, size, options] of FILES) {
  const bytes = render(size, options)
  writeFileSync(`${PATHS.root}/public/${name}`, bytes)
  log(`✓ public/${name} (${(bytes.length / 1024).toFixed(1)} kB)`)
}

const bundle = ico(
  [16, 32, 48].map((size) => ({ size, data: render(size, { rounded: true }) })),
)
writeFileSync(`${PATHS.root}/public/favicon.ico`, bundle)
log(`✓ public/favicon.ico (16·32·48, ${(bundle.length / 1024).toFixed(1)} kB)`)
