/**
 * Genera `public/icon-512.png`, l'icona per «aggiungi alla schermata Home».
 *
 * Serve un PNG perché iOS non accetta SVG per l'icona della home, e sul Mac non
 * c'è un convertitore SVG→PNG installato. Il disegno sono quattro rettangoli
 * (il filo rosso del margine e tre righe di quaderno), quindi si può dipingere a
 * mano su un buffer RGBA e comprimere con lo zlib di Node: nessuna dipendenza.
 *
 * È un'icona «maskable»: fondo a tutto campo, motivo dentro l'80% centrale, così
 * qualunque maschera (cerchio, quadrato stondato) non taglia niente.
 */

import { deflateSync } from 'node:zlib'

import { PATHS, ensureDir, log } from './lib/io.mjs'
import { writeFileSync } from 'node:fs'

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

// ─────────────────────────── codifica PNG ───────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let crc = -1
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
ihdr[10] = 0 // deflate
ihdr[11] = 0 // filtro adattivo
ihdr[12] = 0 // non interlacciato

// Ogni riga va preceduta dal byte di filtro (0 = nessun filtro).
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let y = 0; y < SIZE; y += 1) {
  raw[y * (SIZE * 4 + 1)] = 0
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

ensureDir(`${PATHS.root}/public`)
writeFileSync(`${PATHS.root}/public/icon-512.png`, png)
log(`✓ public/icon-512.png (${(png.length / 1024).toFixed(1)} kB)`)
