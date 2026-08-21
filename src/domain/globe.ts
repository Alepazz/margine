/**
 * Proiezione ortografica: il mondo visto da lontano, come un globo.
 *
 * Trenta righe di trigonometria invece di `d3-geo`: la proiezione ortografica è
 * la più semplice che esista — è letteralmente «guarda la sfera da fuori» — e
 * portarsi dietro una libreria di proiezioni per usarne una sola sarebbe pagare
 * un catalogo per comprare un articolo. → ADR-0020
 *
 * Le coordinate entrano in **gradi**, come stanno nei dati, e la conversione in
 * radianti avviene qui: fuori da questo file non ci sono radianti, così non
 * esiste il posto dove sbagliarsi di un fattore π.
 */

const RAD = Math.PI / 180

/** Dove sta guardando l'osservatore: il punto al centro del disco. */
export interface Viewpoint {
  /** Longitudine al centro, in gradi. */
  lon: number
  /** Latitudine al centro, in gradi. Limitata ai poli. */
  lat: number
}

export interface ScreenPoint {
  x: number
  y: number
}

/**
 * Proietta un punto della sfera sul disco.
 *
 * Restituisce `null` quando il punto sta **dietro l'orizzonte**: su un globo
 * metà del mondo non si vede, e disegnarlo comunque produrrebbe un riflesso
 * speculare sull'altra faccia — il difetto classico di chi salta questo
 * controllo.
 *
 * L'origine è il centro del disco; `y` cresce **verso il basso**, come sullo
 * schermo, così chi disegna non deve ricordarsi di invertirla.
 */
export function project(
  lon: number,
  lat: number,
  view: Viewpoint,
  radius: number,
): ScreenPoint | null {
  const φ = lat * RAD
  const φ0 = view.lat * RAD
  const Δλ = (lon - view.lon) * RAD

  const cosφ = Math.cos(φ)
  const sinφ = Math.sin(φ)
  const cosφ0 = Math.cos(φ0)
  const sinφ0 = Math.sin(φ0)
  const cosΔλ = Math.cos(Δλ)

  /* Coseno della distanza angolare dal centro: negativo = faccia nascosta. */
  const cosC = sinφ0 * sinφ + cosφ0 * cosφ * cosΔλ
  if (cosC < 0) return null

  return {
    x: radius * cosφ * Math.sin(Δλ),
    y: -radius * (cosφ0 * sinφ - sinφ0 * cosφ * cosΔλ),
  }
}

/** Vero quando il punto è sulla faccia che si vede. */
export function isVisible(lon: number, lat: number, view: Viewpoint): boolean {
  return project(lon, lat, view, 1) !== null
}

/**
 * Sposta il punto di vista di un trascinamento, in pixel.
 *
 * La latitudine si ferma prima dei poli: arrivarci capovolge la scena e il
 * gesto successivo sembra andare al contrario.
 */
export function drag(view: Viewpoint, dx: number, dy: number, radius: number): Viewpoint {
  /* Mezzo giro per la larghezza del disco: il globo segue il dito. */
  const perPixel = 90 / Math.max(1, radius)
  return {
    lon: wrapLon(view.lon - dx * perPixel),
    lat: Math.max(-80, Math.min(80, view.lat + dy * perPixel)),
  }
}

/** Riporta una longitudine in −180…180, così il numero non cresce all'infinito. */
export function wrapLon(lon: number): number {
  let value = ((lon + 180) % 360 + 360) % 360 - 180
  /* −180 e 180 sono lo stesso meridiano: si sceglie uno dei due. */
  if (value === -180) value = 180
  return value
}

/** Il punto di vista che mette un posto esattamente al centro. */
export function centreOn(lon: number, lat: number): Viewpoint {
  return { lon: wrapLon(lon), lat: Math.max(-80, Math.min(80, lat)) }
}

/**
 * Quanto è avvicinato il globo: 1 = mezzo mondo dentro il disco.
 *
 * Avvicinare in ortografica vuol dire ingrandire la sfera lasciando fermo il
 * disco: si vede una calotta più piccola, e quello che c'è dentro si allarga.
 * Il massimo è largo di proposito — cinque viaggi in Europa hanno bisogno di
 * arrivare a cinque o sei volte prima di staccarsi l'uno dall'altro.
 */
export const MIN_ZOOM = 1
export const MAX_ZOOM = 12

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_ZOOM
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))
}

/** Punto di vista e avvicinamento: l'inquadratura completa. */
export interface Framing {
  view: Viewpoint
  zoom: number
}

/** Quanta parte del raggio devono occupare i puntini una volta inquadrati. */
const FILL = 0.62

/** L'inquadratura di partenza quando non c'è nessun posto da guardare: l'Italia. */
const DEFAULT_FRAMING: Framing = { view: { lon: 12, lat: 42 }, zoom: 1 }

/**
 * L'inquadratura che tiene dentro tutti i posti e li allontana il più possibile
 * fra loro.
 *
 * Senza questo il globo è inservibile con dei dati veri: cinque viaggi tutti in
 * Europa cadono in un fazzoletto di quaranta pixel, due di essi a otto pixel
 * l'uno dall'altro — i puntini si sovrappongono e non c'è modo di mirarli. Il
 * difetto non è il tocco, è l'inquadratura. → ADR-0021
 */
export function fitMarks(places: readonly { lon: number; lat: number }[]): Framing {
  const first = places[0]
  if (!first) return DEFAULT_FRAMING
  const view = centroid(places, first)

  /* La distanza dal centro del posto più lontano, su sfera di raggio 1. */
  let spread = 0
  for (const place of places) {
    const point = project(place.lon, place.lat, view, 1)
    /* Un posto dietro l'orizzonte anche dal baricentro vuol dire posti sparsi
       su più di mezzo mondo: allora l'inquadratura giusta è il mondo intero. */
    if (!point) return { view, zoom: MIN_ZOOM }
    spread = Math.max(spread, Math.hypot(point.x, point.y))
  }

  /* Un posto solo, o più posti nello stesso punto: niente da allargare. */
  if (spread < 1e-6) return { view, zoom: MIN_ZOOM }
  return { view, zoom: clampZoom(FILL / spread) }
}

/** Quanto devono essere vicini due puntini perché il dito non li distingua. */
export const CLUSTER_DISTANCE = 24

export interface Group<T> {
  items: T[]
  /** Il centro del gruppo sullo schermo: è lì che si disegna il puntino unico. */
  at: ScreenPoint
}

/**
 * Raggruppa i puntini che cadono troppo vicini per essere mirati.
 *
 * Serve perché l'inquadratura non basta più. `fitMarks` allontana i puntini
 * finché **tutti** stanno nel disco, quindi un solo viaggio lontano — New York
 * fra cinque viaggi europei — riporta l'avvicinamento a 1 e l'Europa a un
 * grumo: misurato, la distanza minima crolla da 25,6px a 8,2px, che è
 * esattamente il difetto da cui nasce l'ADR-0021. Con più continenti non esiste
 * un'inquadratura che vada bene per tutti, quindi i puntini che si pestano
 * diventano uno, con scritto quanti sono. → ADR-0036
 *
 * Si fonde **la coppia più vicina alla volta**, finché non ne resta nessuna
 * sotto `minDistance`. La versione ovvia — ogni puntino nel primo gruppo che lo
 * accoglie — non garantiva niente: fondendo due puntini il centro si sposta, e
 * si ritrovava a 23,9px da un terzo, cioè di nuovo sotto il bersaglio del dito.
 * Così invece la garanzia vale per costruzione, ed è quella che misura il test.
 *
 * I pareggi li decide l'ordine dell'elenco, che è sempre lo stesso: il
 * raggruppamento non balla da un fotogramma all'altro.
 */
export function groupNearby<T extends { at: ScreenPoint }>(
  placed: readonly T[],
  minDistance = CLUSTER_DISTANCE,
): Group<T>[] {
  const groups: Group<T>[] = placed.map((entry) => ({
    items: [entry],
    at: { x: entry.at.x, y: entry.at.y },
  }))

  for (;;) {
    let best: { a: number; b: number; d: number } | null = null
    for (let i = 0; i < groups.length; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) {
        const a = groups[i]!
        const b = groups[j]!
        const d = Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y)
        if (d < minDistance && (!best || d < best.d)) best = { a: i, b: j, d }
      }
    }
    if (!best) return groups
    const a = groups[best.a]!
    const b = groups[best.b]!
    const items = [...a.items, ...b.items]
    /* Il centro è la media di quello che contiene, così il puntino unico sta in
       mezzo ai suoi invece che sul primo arrivato. */
    groups.splice(best.b, 1)
    groups[best.a] = {
      items,
      at: {
        x: items.reduce((sum, item) => sum + item.at.x, 0) / items.length,
        y: items.reduce((sum, item) => sum + item.at.y, 0) / items.length,
      },
    }
  }
}

/**
 * Il centro fra più posti, passando per i vettori sulla sfera: la media delle
 * longitudini sbaglierebbe di mezzo mondo a cavallo del meridiano 180.
 */
function centroid(
  places: readonly { lon: number; lat: number }[],
  fallback: { lon: number; lat: number },
): Viewpoint {
  let x = 0
  let y = 0
  let z = 0
  for (const place of places) {
    const φ = place.lat * RAD
    const λ = place.lon * RAD
    const cosφ = Math.cos(φ)
    x += cosφ * Math.cos(λ)
    y += cosφ * Math.sin(λ)
    z += Math.sin(φ)
  }
  const length = Math.hypot(x, y, z)
  /* Posti esattamente agli antipodi si annullano a vicenda: un centro non
     esiste, e si guarda il primo. */
  if (length < 1e-9) return centreOn(fallback.lon, fallback.lat)
  return centreOn(Math.atan2(y, x) / RAD, Math.asin(z / length) / RAD)
}
