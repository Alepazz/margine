/**
 * Il colore della fascia si calcola in due posti — nel canvas dell'app e nei
 * pixel di `sharp` durante l'import — e questo test li mette davanti allo
 * stesso buffer. Se divergessero, una carta importata dal Mac e la stessa carta
 * aggiunta dal telefono avrebbero due fasce di colore diverso, in silenzio.
 *
 * I casi sono quelli che una faccia ha davvero: una tinta con un logo chiaro in
 * mezzo (il caso normale), la stessa con il rumore che lascia il JPEG, una
 * tessera bianca (Pam), e l'immagine di un pixel solo.
 */

import { describe, expect, it } from 'vitest'

import { edgeColor as edgeColorApp } from '../../src/data/card-image.ts'
import { edgeColor as edgeColorImport } from './card-color.mjs'

/** Un'immagine RGBA `width × height` di una tinta, con un rettangolo chiaro in mezzo. */
function face(width, height, base, logo, noise = 0) {
  const data = new Uint8ClampedArray(width * height * 4)
  let seed = 7
  const jitter = () => {
    /* Rumore deterministico, come lo lascerebbe una compressione: ±noise. */
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return noise === 0 ? 0 : (seed % (noise * 2 + 1)) - noise
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inLogo = y > height * 0.35 && y < height * 0.65 && x > width * 0.2 && x < width * 0.8
      const [r, g, b] = inLogo ? logo : base
      const i = (y * width + x) * 4
      data[i] = Math.max(0, Math.min(255, r + jitter()))
      data[i + 1] = Math.max(0, Math.min(255, g + jitter()))
      data[i + 2] = Math.max(0, Math.min(255, b + jitter()))
      data[i + 3] = 255
    }
  }
  return data
}

const CASES = [
  ['tinta con logo chiaro', face(40, 25, [216, 0, 24], [255, 255, 255])],
  ['la stessa, col rumore del JPEG', face(40, 25, [216, 0, 24], [255, 255, 255], 3)],
  ['tessera bianca', face(40, 25, [255, 255, 255], [0, 128, 64])],
  ['un pixel solo', face(1, 1, [0, 96, 168], [0, 96, 168])],
]

describe('edgeColor: app e import dicono lo stesso colore', () => {
  it.each(CASES)('%s', (_name, data) => {
    const width = data.length === 4 ? 1 : 40
    const height = data.length / 4 / width
    const app = edgeColorApp(data, width, height)
    const script = edgeColorImport(data, width, height)
    expect(script).toBe(app)
    expect(app).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('sceglie la tinta dei bordi, non il logo, e il rumore non la sposta', () => {
    const pulita = edgeColorApp(face(40, 25, [216, 0, 24], [255, 255, 255]), 40, 25)
    const rumorosa = edgeColorApp(face(40, 25, [216, 0, 24], [255, 255, 255], 3), 40, 25)
    /* 216 → 216, 0 → 0, 24 → 24: sono già multipli del passo. */
    expect(pulita).toBe('#d80018')
    expect(rumorosa).toBe('#d80018')
  })

  it('su una tessera bianca la fascia è bianca', () => {
    expect(edgeColorApp(face(40, 25, [255, 255, 255], [0, 128, 64]), 40, 25)).toBe('#ffffff')
  })

  it('senza pixel non inventa un colore', () => {
    expect(edgeColorApp(new Uint8ClampedArray(0), 0, 0)).toBeUndefined()
    expect(edgeColorImport(new Uint8ClampedArray(0), 0, 0)).toBeUndefined()
  })
})
