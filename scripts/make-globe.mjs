/**
 * Prepara il contorno delle terre per il mappamondo della pagina Vacanze.
 *
 * Legge `world-atlas` (110m, il livello più grezzo: per un globo da 320px basta
 * e avanza) e scrive un file TypeScript con gli anelli come coppie di gradi
 * arrotondate a un decimale — circa undici chilometri di precisione, che a
 * quella scala è meno di mezzo pixel.
 *
 * Si genera qui e non nel browser di proposito: `world-atlas` e
 * `topojson-client` restano **dipendenze di sviluppo**, e nel pacchetto che
 * arriva sul telefono entra solo il dato, senza libreria. È lo stesso patto di
 * `make-icon.mjs`, che genera l'icona invece di calcolarla a runtime. → ADR-0020
 */

import { readFileSync, writeFileSync } from 'node:fs'

import { feature } from 'topojson-client'

const OUT = 'src/domain/globe-land.ts'
/** Un decimale di grado: ~11 km, sotto il mezzo pixel su un globo da 320px. */
const DECIMALS = 1
/** Anelli con meno vertici di così sono isolotti invisibili a questa scala. */
const MIN_POINTS = 5

const topology = JSON.parse(readFileSync('node_modules/world-atlas/land-110m.json', 'utf8'))
/* `feature()` restituisce una FeatureCollection, anche per un oggetto solo. */
const land = feature(topology, topology.objects.land).features[0]

const round = (value) => Number(value.toFixed(DECIMALS))

/** Toglie i vertici consecutivi che l'arrotondamento ha reso identici. */
function dedupe(ring) {
  const out = []
  for (const [lon, lat] of ring) {
    const point = [round(lon), round(lat)]
    const last = out[out.length - 1]
    if (last && last[0] === point[0] && last[1] === point[1]) continue
    out.push(point)
  }
  return out
}

const rings = []
for (const geometry of land.geometry.coordinates) {
  /* Un polygon è [anello esterno, buchi…]: i buchi sono laghi, e a questa scala
     non si vedono. Si tiene solo il contorno esterno. */
  const outer = Array.isArray(geometry[0][0]) ? geometry[0] : geometry
  const ring = dedupe(outer)
  if (ring.length >= MIN_POINTS) rings.push(ring)
}

rings.sort((a, b) => b.length - a.length)

const body = rings.map((ring) => `  [${ring.map(([x, y]) => `[${x},${y}]`).join(',')}],`).join('\n')

const file = `/**
 * Contorno delle terre emerse, in gradi: \`[longitudine, latitudine]\`.
 *
 * GENERATO DA \`npm run globe\` — non modificare a mano. Sorgente: world-atlas
 * 110m, arrotondato a un decimale e senza laghi. Serve al mappamondo della
 * pagina Vacanze, che lo proietta con \`domain/globe.ts\`.
 */

export const LAND: readonly (readonly (readonly [number, number])[])[] = [
${body}
]
`

writeFileSync(OUT, file)

const kb = (Buffer.byteLength(file) / 1024).toFixed(0)
const points = rings.reduce((sum, ring) => sum + ring.length, 0)
console.log(`✓ ${OUT}: ${rings.length} anelli, ${points} vertici, ${kb} kB`)
