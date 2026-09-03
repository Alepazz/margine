/**
 * Il vettoriale scritto a mano e la geometria che genera i PNG dicono la stessa
 * cosa.
 *
 * Il marchio vive in **due posti** — `public/favicon.svg`, disegnato a mano, e
 * `lib/icon-geometry.mjs`, che `make-icon.mjs` rasterizza — e nel progetto ogni
 * cosa che vive due volte ha un test che prova che le due concordano (la
 * cifratura, le regole di una spesa, quelle delle carte, quelle della lista).
 * Qui il costo di un disaccordo è più subdolo che altrove: niente si rompe, non
 * c'è nessun errore, e la linguetta del browser mostra un segno appena diverso
 * da quello sulla schermata Home — un difetto che si vede solo affiancandoli, e
 * che nessuno affianca mai.
 *
 * Il test non rasterizza e non confronta pixel: legge i **numeri** dal
 * vettoriale e li confronta con quelli calcolati. Se un giorno si cambia il
 * raggio di un anello in un posto solo, cade qui.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { ROOT } from './io.mjs'
import {
  CORAL,
  EYE_L,
  EYE_R,
  NAVY,
  PAPER,
  RADIUS,
  RING_R,
  RING_W,
  RINGS,
  SCALE,
  SIDE,
  SLATE,
  reach,
  ringPoint,
} from './icon-geometry.mjs'

const svg = readFileSync(`${ROOT}/public/favicon.svg`, 'utf8')

/** `[0x12, 0x29, 0x4a]` → `#12294a`, la forma in cui il colore sta nell'SVG. */
function hex(rgb) {
  return `#${rgb.map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

describe('il vettoriale e la geometria dei PNG concordano', () => {
  it('lo spazio di disegno e gli angoli stondati', () => {
    expect(svg).toContain(`viewBox="0 0 ${SIDE} ${SIDE}"`)
    expect(svg).toContain(`rx="${RADIUS}"`)
  })

  it('i quattro colori, e nessun altro', () => {
    expect(svg).toContain(`fill="${hex(NAVY)}"`)
    expect(svg).toContain(`stroke="${hex(SLATE)}"`)
    expect(svg).toContain(`stroke="${hex(PAPER)}"`)
    expect(svg).toContain(`fill="${hex(CORAL)}"`)
    /* Un colore in più nel vettoriale sarebbe un colore che i PNG non
       dipingono: la tavolozza è chiusa. */
    const usati = new Set(svg.match(/#[0-9a-f]{6}/g))
    expect([...usati].sort()).toEqual([hex(NAVY), hex(CORAL), hex(SLATE), hex(PAPER)].sort())
  })

  it('la riduzione al 90%, che è quella che tiene il marchio dentro la maschera', () => {
    expect(svg).toContain(`scale(${SCALE})`)
    /* La ragione del numero, non solo il numero: il punto più esterno deve
       stare dentro il cerchio di sicurezza di 40 unità. */
    expect(reach()).toBeLessThanOrEqual(40)
  })

  it('lo spessore e il raggio degli anelli', () => {
    expect(svg).toContain(`stroke-width="${RING_W}"`)
    expect(svg.match(new RegExp(`A${RING_R} ${RING_R} 0 1 [01]`, 'g'))).toHaveLength(RINGS.length)
  })

  it('gli anelli attaccano dove dice la geometria', () => {
    for (const ring of RINGS) {
      /*
       * Il varco della G ha due bordi: uno **obliquo**, in alto verso l'esterno,
       * e uno **sull'asse orizzontale**, dove entra il trattino. L'arco parte
       * dall'obliquo e finisce sull'asse — e specchiando la G i due si
       * scambiano, perché lo specchio inverte anche il verso di percorrenza.
       */
      const obliquo = ring.mirrored ? ring.gapFrom : ring.gapTo
      const asse = ring.mirrored ? ring.gapTo : ring.gapFrom
      const parte = ringPoint(ring, obliquo)
      const arriva = ringPoint(ring, asse)
      expect(svg).toContain(`M${parte.x.toFixed(2)} ${parte.y.toFixed(2)}`)
      expect(svg).toContain(`${arriva.x.toFixed(0)} ${arriva.y.toFixed(0)}"`)
    }
  })

  it('il raggio della mandorla è quello calcolato, non un numero a caso', () => {
    /* È il valore che fa passare il cerchio per le punte e per il colmo: se
       nell'SVG ce ne fosse un altro, la mandorla del vettoriale e quella dei
       PNG sarebbero due forme diverse. */
    expect(svg).toContain(`A${EYE_R.toFixed(2)} ${EYE_R.toFixed(2)}`)
    expect(EYE_R).toBeCloseTo(31.02, 2)
  })

  it('le mandorle sono lunghe quanto il diametro degli anelli', () => {
    /* La punta della mandorla poggia sull'asse dell'anello, come il trattino di
       una G poggia sulla pancia: se le due misure divergessero, l'occhio
       sporgerebbe o non arriverebbe. */
    expect(EYE_L).toBe(RING_R)
    for (const ring of RINGS) {
      expect(svg).toContain(`M${ring.cx - EYE_L} 50 A`)
    }
  })
})
