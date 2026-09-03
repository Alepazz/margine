/**
 * Genera `public/icon-512.png`, l'icona per «aggiungi alla schermata Home».
 *
 * Serve un PNG perché iOS non accetta SVG per l'icona della home, e sul Mac non
 * c'è un convertitore SVG→PNG installato. Il disegno sono quattro rettangoli
 * (il filo rosso del margine e tre righe di quaderno), quindi si può dipingere a
 * mano su un buffer RGBA; la codifica PNG la fa `lib/png.mjs`, lo stesso encoder
 * delle facce di tessera del seed. Nessuna dipendenza.
 *
 * È un'icona «maskable»: fondo a tutto campo, motivo dentro l'80% centrale, così
 * qualunque maschera (cerchio, quadrato stondato) non taglia niente.
 */

import { writeFileSync } from 'node:fs'

import { PATHS, ensureDir, log } from './lib/io.mjs'
import { png } from './lib/png.mjs'

const SIZE = 512

const INK = [0x10, 0x18, 0x20]
const RULE = [0xe0, 0x57, 0x4c]
const PAPER = [0xe9, 0xef, 0xf3]
const MUTED = [0x8f, 0xa3, 0xb0]

const pixels = Buffer.alloc(SIZE * SIZE * 4)

function fill(color, alpha = 255) {
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    pixels[i * 4] = color[0]
    pixels[i * 4 + 1] = color[1]
    pixels[i * 4 + 2] = color[2]
    pixels[i * 4 + 3] = alpha
  }
}

/** Rettangolo con angoli stondati, in coordinate 0–1 rispetto al lato. */
function rect(x0, y0, w, h, color, radius = 0, alpha = 255) {
  const left = Math.round(x0 * SIZE)
  const top = Math.round(y0 * SIZE)
  const width = Math.round(w * SIZE)
  const height = Math.round(h * SIZE)
  const r = Math.min(Math.round(radius * SIZE), Math.floor(width / 2), Math.floor(height / 2))

  for (let y = top; y < top + height; y += 1) {
    if (y < 0 || y >= SIZE) continue
    for (let x = left; x < left + width; x += 1) {
      if (x < 0 || x >= SIZE) continue
      if (r > 0) {
        const dx = Math.max(left + r - x, x - (left + width - 1 - r), 0)
        const dy = Math.max(top + r - y, y - (top + height - 1 - r), 0)
        if (dx > 0 && dy > 0 && dx * dx + dy * dy > r * r) continue
      }
      const index = (y * SIZE + x) * 4
      const src = alpha / 255
      pixels[index] = Math.round(color[0] * src + pixels[index] * (1 - src))
      pixels[index + 1] = Math.round(color[1] * src + pixels[index + 1] * (1 - src))
      pixels[index + 2] = Math.round(color[2] * src + pixels[index + 2] * (1 - src))
      pixels[index + 3] = 255
    }
  }
}

fill(INK)
rect(0.28, 0.24, 0.045, 0.52, RULE, 0.022)
rect(0.4, 0.29, 0.32, 0.065, PAPER, 0.032)
rect(0.4, 0.4525, 0.235, 0.065, MUTED, 0.032)
rect(0.4, 0.615, 0.15, 0.065, MUTED, 0.032, 190)

const bytes = png(
  SIZE,
  SIZE,
  (x, y) => {
    const i = (y * SIZE + x) * 4
    return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]]
  },
  { alpha: true },
)

ensureDir(`${PATHS.root}/public`)
writeFileSync(`${PATHS.root}/public/icon-512.png`, bytes)
log(`✓ public/icon-512.png (${(bytes.length / 1024).toFixed(1)} kB)`)
