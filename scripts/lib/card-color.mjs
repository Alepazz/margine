/**
 * Il colore dominante dei **bordi** di una faccia di tessera.
 *
 * È la seconda implementazione di `edgeColor` in `src/data/card-image.ts`, come
 * per le regole delle spese: l'app lo calcola nel canvas, l'import delle carte
 * nei pixel che `sharp` ha ridimensionato, e `card-color-parity.test.mjs` prova
 * che sullo stesso buffer dicono lo stesso colore. Un cambiamento va fatto ai
 * due lati **e** al test.
 *
 * Dei bordi e non del centro perché al centro c'è il logo e sul bordo c'è la
 * tinta della tessera; il più frequente e non la media, perché la media di un
 * logo bianco su fondo rosso è un rosa che non somiglia a nessuno dei due. I
 * canali si arrotondano a passi di 24 prima di contare, altrimenti la
 * compressione JPEG — che sposta ogni pixel di un paio di valori — spezzerebbe
 * il fondo in mille tinte quasi identiche e nessuna vincerebbe.
 *
 * @param {Uint8Array | Uint8ClampedArray} data RGBA, quattro byte per pixel
 * @returns {string | undefined} `#rrggbb`, o `undefined` su un'immagine vuota
 */
export function edgeColor(data, width, height) {
  const step = 24
  const margin = Math.max(1, Math.round(height * 0.22))
  const counts = new Map()
  for (let y = 0; y < height; y += 1) {
    /* Solo la fascia alta e quella bassa: il logo sta in mezzo. */
    if (y >= margin && y < height - margin) continue
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      const key = [0, 1, 2]
        .map((offset) => Math.min(255, Math.round((data[i + offset] ?? 0) / step) * step))
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  let best
  let most = 0
  for (const [color, count] of counts) {
    if (count > most) {
      most = count
      best = color
    }
  }
  return best === undefined ? undefined : `#${best}`
}
