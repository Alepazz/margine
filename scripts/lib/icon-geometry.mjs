/**
 * La geometria del marchio di Giano, in un posto solo.
 *
 * Due G specchiate e fuse, e il trattino di ciascuna è una mandorla: l'occhio
 * socchiuso del dio che guarda avanti e indietro. → ADR-0093
 *
 * Sta in `lib/` e non dentro `make-icon.mjs` perché quello script **scrive dei
 * file appena lo importi**, quindi un test non lo può caricare per confrontarne
 * le costanti. Qui invece non succede niente: numeri e disuguaglianze, che
 * `make-icon.mjs` rasterizza e `icon-parity.test.mjs` confronta con il
 * vettoriale scritto a mano in `public/favicon.svg`.
 *
 * Lo spazio è quello del `viewBox`: 100 unità per lato, l'origine in alto a
 * sinistra, la y verso il basso. Gli **angoli** invece si contano come in
 * matematica, con la y verso l'alto, perché è la convenzione dei gradi che
 * compaiono nei commenti del vettoriale.
 */

// ── La tavolozza ──
export const NAVY = [0x12, 0x29, 0x4a]
export const SLATE = [0x8f, 0xa3, 0xb0]
export const PAPER = [0xe9, 0xef, 0xf3]
export const CORAL = [0xe0, 0x57, 0x4c]

/** Il lato dello spazio di disegno: le misure qui sotto sono in queste unità. */
export const SIDE = 100

/**
 * Il marchio è ridotto al 90%.
 *
 * Le icone dell'app sono *maskable*: a piena misura il marchio arriva a 43.5
 * unità dal centro, e una maschera tonda ritaglia a 40 — le punte degli anelli
 * sarebbero tagliate su Android. Misurato, non stimato.
 */
export const SCALE = 0.9

/** Il raggio degli angoli stondati: serve alle favicon, non alle icone dell'app. */
export const RADIUS = 22

export const RING_R = 19
export const RING_W = 9

/** Mezza lunghezza e mezza altezza della mandorla. */
export const EYE_L = 19
export const EYE_H = 6.5

/**
 * Il raggio del cerchio la cui intersezione col suo gemello dà la mandorla:
 * passa per le due punte `(±EYE_L, 0)` e per il colmo `(0, EYE_H)`.
 *
 * **La mandorla è un'intersezione di cerchi, non una curva di Bézier**, e la
 * ragione è la parità: un arco di cerchio il vettoriale lo sa disegnare e
 * questo file lo sa calcolare, una quadratica no — e due forme *quasi* uguali
 * fra l'SVG e il PNG sono un difetto che si vede solo affiancandoli.
 */
export const EYE_R = (EYE_L * EYE_L + EYE_H * EYE_H) / (2 * EYE_H)

/** Distanza dei due centri dall'asse della mandorla. */
export const EYE_K = EYE_R - EYE_H

/**
 * I due anelli: il centro, il colore, e il varco della G in gradi.
 *
 * Il varco guarda **in fuori** — in alto a sinistra per la G di sinistra, in
 * alto a destra per quella di destra — così le due lettere guardano in
 * direzioni opposte, che è tutto il senso del marchio.
 */
export const RINGS = [
  { cx: 30, color: SLATE, gapFrom: 146, gapTo: 180, mirrored: true },
  { cx: 70, color: PAPER, gapFrom: 0, gapTo: 34, mirrored: false },
]

/** I centri delle due mandorle, sull'asse orizzontale. */
export const EYES = RINGS.map((ring) => ring.cx)

const DEG = 180 / Math.PI

/** Dentro la corona circolare di un anello, e fuori dal suo varco. */
export function inRing(x, y, ring) {
  const dx = x - ring.cx
  const dy = 50 - y
  if (Math.abs(Math.hypot(dx, dy) - RING_R) > RING_W / 2) return false
  let a = Math.atan2(dy, dx) * DEG
  if (a < 0) a += 360
  return !(a > ring.gapFrom && a < ring.gapTo)
}

/** Dentro entrambi i dischi: la mandorla è la loro intersezione. */
export function inEye(x, y, cx) {
  return (
    Math.hypot(x - cx, y - (50 + EYE_K)) <= EYE_R &&
    Math.hypot(x - cx, y - (50 - EYE_K)) <= EYE_R
  )
}

/** Dentro il quadrato con gli angoli stondati. */
export function inRounded(x, y) {
  const ox = Math.max(RADIUS - x, x - (SIDE - RADIUS), 0)
  const oy = Math.max(RADIUS - y, y - (SIDE - RADIUS), 0)
  return ox * ox + oy * oy <= RADIUS * RADIUS
}

/**
 * Il colore in un punto, in ordine di pittura: fondo, anelli, occhi.
 * Torna `null` fuori dagli angoli stondati, quando sono richiesti.
 */
export function colorAt(x, y, { rounded = false } = {}) {
  if (rounded && !inRounded(x, y)) return null
  /* Il marchio è scalato: si prova il punto nel suo spazio, non in quello
     dell'icona. */
  const mx = (x - 50) / SCALE + 50
  const my = (y - 50) / SCALE + 50
  for (const cx of EYES) if (inEye(mx, my, cx)) return CORAL
  for (const ring of RINGS) if (inRing(mx, my, ring)) return ring.color
  return NAVY
}

/** Il punto sulla circonferenza di un anello, a un angolo in gradi. */
export function ringPoint(ring, degrees) {
  const a = degrees / DEG
  return { x: ring.cx + RING_R * Math.cos(a), y: 50 - RING_R * Math.sin(a) }
}

/** Quanto si allontana dal centro il punto più esterno del marchio, scalato. */
export function reach() {
  const estremo = Math.max(...RINGS.map((r) => Math.abs(r.cx - 50))) + RING_R + RING_W / 2
  return estremo * SCALE
}
