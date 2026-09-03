/**
 * Un PNG scritto a mano: l'unico encoder degli script.
 *
 * Lo usano due cose. L'icona per la schermata Home (`make-icon.mjs`, che lo
 * aveva in casa e ora lo importa da qui) e le **facce di tessera** dei dati di
 * esempio: il modello accetta solo PNG, JPEG e WebP — un SVG non lo accetta, e
 * allargare il modello perché il seed potesse essere pigro sarebbe il
 * ragionamento al contrario. E senza un'immagine nei dati di esempio la griglia
 * delle carte non mostrerebbe mai il caso con la faccia, cioè quello normale.
 *
 * Quaranta righe invece di `sharp`, che è un binario nativo e c'è solo per
 * l'import delle carte: qui non c'è niente da decodificare, si scrivono dei
 * pixel. E il risultato è **deterministico** fra versioni di Node, che è
 * l'invariante del seed e dell'icona — due esecuzioni devono dare lo stesso
 * file, e l'encoder di una libreria può cambiare byte a ogni aggiornamento.
 *
 * Non è un encoder generico e non deve diventarlo: colori pieni con o senza
 * alfa, nessuna palette, nessun interlacciamento. Se un giorno servisse di più,
 * si usa `sharp`, che per quel mestiere c'è già.
 */

import { deflateSync } from 'node:zlib'

/** CRC32, come lo vuole il formato: tabella calcolata una volta. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Un blocco: lunghezza, tipo, dati, CRC di tipo+dati. */
function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/**
 * Un PNG a colori pieni, `pixel(x, y)` → `[r, g, b]` o, con `alpha`, `[r, g, b, a]`.
 *
 * `level: 9` non è per risparmiare byte — un rettangolo di tinta piatta si
 * comprime comunque a niente — ma perché il livello faccia parte dell'input:
 * il livello di default di zlib potrebbe cambiare fra due versioni di Node, e
 * con lui il file scritto dal seed.
 */
export function png(width, height, pixel, { alpha = false } = {}) {
  const channels = alpha ? 4 : 3
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // otto bit per canale
  header[9] = alpha ? 6 : 2 // colori pieni, con o senza alfa
  // compressione, filtro e interlacciamento restano a zero

  /* Ogni riga porta davanti il suo byte di filtro: zero, cioè «nessuno». */
  const raw = Buffer.alloc(height * (1 + width * channels))
  let at = 0
  for (let y = 0; y < height; y += 1) {
    raw[at] = 0
    at += 1
    for (let x = 0; x < width; x += 1) {
      const px = pixel(x, y)
      for (let c = 0; c < channels; c += 1) raw[at + c] = px[c]
      at += channels
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Da `#rrggbb` ai tre canali. */
export function rgb(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ]
}

/**
 * La faccia di una tessera d'esempio: la tinta del marchio con una fascia più
 * chiara in mezzo, dove sulle carte vere sta il logo.
 *
 * Il data URI è quello che finisce nel dato, ed è la stessa forma che scrive
 * l'app quando si sceglie un'immagine dalla galleria.
 */
export function cardFaceDataUri(hex, { width = 320, height = 202 } = {}) {
  const base = rgb(hex)
  /* La fascia: lo stesso colore schiarito verso il bianco di un terzo. */
  const band = base.map((channel) => Math.round(channel + (255 - channel) * 0.34))
  const from = Math.round(height * 0.42)
  const to = Math.round(height * 0.58)
  const buffer = png(width, height, (x, y) =>
    y >= from && y < to && x > width * 0.18 && x < width * 0.82 ? band : base,
  )
  return `data:image/png;base64,${buffer.toString('base64')}`
}
