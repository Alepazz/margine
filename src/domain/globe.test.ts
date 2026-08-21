import { describe, expect, it } from 'vitest'

import {
  CLUSTER_DISTANCE,
  centreOn,
  clampZoom,
  drag,
  fitMarks,
  groupNearby,
  isVisible,
  MAX_ZOOM,
  project,
  wrapLon,
} from './globe'

const CENTRO = { lon: 0, lat: 0 }

describe('proiezione ortografica', () => {
  it('mette il centro dello sguardo al centro del disco', () => {
    const p = project(0, 0, CENTRO, 100)
    /* `toBeCloseTo` e non `toEqual`: seno e coseno non tornano zeri esatti, e
       pretenderli renderebbe il test una trappola invece di una garanzia. */
    expect(p?.x).toBeCloseTo(0, 9)
    expect(p?.y).toBeCloseTo(0, 9)
  })

  it('manda il nord in alto: y cresce verso il basso, come sullo schermo', () => {
    const nord = project(0, 45, CENTRO, 100)
    expect(nord).not.toBeNull()
    expect(nord?.y).toBeLessThan(0)
    expect(nord?.x).toBeCloseTo(0, 6)
  })

  it('manda l’est a destra', () => {
    const est = project(45, 0, CENTRO, 100)
    expect(est?.x).toBeGreaterThan(0)
  })

  it('mette il bordo del disco a esattamente un raggio', () => {
    /* Novanta gradi dal centro è l'orizzonte: il punto cade sul bordo. */
    const bordo = project(90, 0, CENTRO, 100)
    expect(bordo?.x).toBeCloseTo(100, 6)
    expect(bordo?.y).toBeCloseTo(0, 6)
  })

  it('nasconde la faccia dietro l’orizzonte invece di specchiarla', () => {
    /* È l'errore classico: senza il controllo, il punto agli antipodi
       ricomparirebbe sulla faccia visibile, a specchio. */
    expect(project(180, 0, CENTRO, 100)).toBeNull()
    expect(project(120, 0, CENTRO, 100)).toBeNull()
    expect(isVisible(180, 0, CENTRO)).toBe(false)
    expect(isVisible(0, 0, CENTRO)).toBe(true)
  })

  it('non confonde due punti agli antipodi', () => {
    const qua = project(30, 20, CENTRO, 100)
    const la = project(-150, -20, CENTRO, 100)
    expect(qua).not.toBeNull()
    expect(la).toBeNull()
  })

  it('ruotando il globo, un punto prima nascosto diventa visibile', () => {
    const tokyo = { lon: 139.7, lat: 35.7 }
    expect(isVisible(tokyo.lon, tokyo.lat, CENTRO)).toBe(false)
    expect(isVisible(tokyo.lon, tokyo.lat, centreOn(tokyo.lon, tokyo.lat))).toBe(true)
    const centrata = project(tokyo.lon, tokyo.lat, centreOn(tokyo.lon, tokyo.lat), 100)
    expect(centrata?.x).toBeCloseTo(0, 9)
    expect(centrata?.y).toBeCloseTo(0, 9)
  })
})

describe('trascinamento', () => {
  it('il globo segue il dito: trascinare a destra porta a vista l’ovest', () => {
    const dopo = drag(CENTRO, 50, 0, 160)
    expect(dopo.lon).toBeLessThan(0)
  })

  it('non arriva ai poli, dove la scena si capovolgerebbe', () => {
    const su = drag(CENTRO, 0, 10_000, 160)
    expect(su.lat).toBe(80)
    const giu = drag(CENTRO, 0, -10_000, 160)
    expect(giu.lat).toBe(-80)
  })

  it('la longitudine resta in −180…180 invece di crescere all’infinito', () => {
    let view = CENTRO
    for (let i = 0; i < 40; i += 1) view = drag(view, -100, 0, 160)
    expect(view.lon).toBeGreaterThanOrEqual(-180)
    expect(view.lon).toBeLessThanOrEqual(180)
  })

  it('avvolge la longitudine senza salti', () => {
    expect(wrapLon(190)).toBeCloseTo(-170, 6)
    expect(wrapLon(-190)).toBeCloseTo(170, 6)
    expect(wrapLon(360)).toBeCloseTo(0, 6)
    expect(wrapLon(-180)).toBe(180)
  })
})

describe('inquadratura', () => {
  /* I cinque viaggi veri: tutti in Europa, cioè il caso che ha rotto il globo. */
  const VIAGGI = [
    { lon: 10.4, lat: 51.2 }, // Germania
    { lon: 2.35, lat: 48.86 }, // Parigi
    { lon: 14.4, lat: 42.35 }, // Ortona
    { lon: 24.81, lat: 35.24 }, // Creta
    { lon: 16.2, lat: 39.5 }, // Sud Italia
  ]
  /* Il raggio del disco su un telefono da 390px, misurato. */
  const RAGGIO = 152

  /** La distanza minima fra due puntini, in pixel sullo schermo. */
  function minimaDistanza(zoom: number, view: { lon: number; lat: number }): number {
    const punti = VIAGGI.map((p) => project(p.lon, p.lat, view, RAGGIO * zoom))
    let min = Infinity
    for (let i = 0; i < punti.length; i += 1) {
      for (let j = i + 1; j < punti.length; j += 1) {
        const a = punti[i]
        const b = punti[j]
        if (!a || !b) continue
        min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y))
      }
    }
    return min
  }

  it('senza inquadratura i puntini si sovrappongono: è il difetto da cui nasce tutto', () => {
    /* A zoom 1, centrati sul primo viaggio, due puntini cadono a otto pixel
       l'uno dall'altro — cioè dentro il proprio raggio di sei. Mirarli è
       impossibile, e il globo sembra non rispondere al tocco. */
    const distanza = minimaDistanza(1, centreOn(VIAGGI[0]?.lon ?? 0, VIAGGI[0]?.lat ?? 0))
    expect(distanza).toBeLessThan(16)
  })

  it('inquadrando, ogni puntino diventa un bersaglio distinto', () => {
    const { view, zoom } = fitMarks(VIAGGI)
    expect(zoom).toBeGreaterThan(3)
    /* La garanzia che conta: due puntini abbastanza lontani perché il tocco
       scelga senza ambiguità quello che si stava mirando. */
    expect(minimaDistanza(zoom, view)).toBeGreaterThan(24)
  })

  it('tiene tutti i posti dentro il disco', () => {
    const { view, zoom } = fitMarks(VIAGGI)
    for (const posto of VIAGGI) {
      const punto = project(posto.lon, posto.lat, view, RAGGIO * zoom)
      expect(punto).not.toBeNull()
      expect(Math.hypot(punto?.x ?? 0, punto?.y ?? 0)).toBeLessThan(RAGGIO)
    }
  })

  it('un posto solo sta al centro, e non si avvicina a niente', () => {
    const { view, zoom } = fitMarks([{ lon: 139.7, lat: 35.7 }])
    expect(zoom).toBe(1)
    const punto = project(139.7, 35.7, view, RAGGIO)
    expect(punto?.x).toBeCloseTo(0, 9)
    expect(punto?.y).toBeCloseTo(0, 9)
  })

  it('trova il centro anche a cavallo del meridiano 180', () => {
    /* La media delle longitudini darebbe 0, cioè l'Africa: dalla parte opposta
       del mondo rispetto a dove si è stati. */
    const { view } = fitMarks([
      { lon: 170, lat: 0 },
      { lon: -170, lat: 0 },
    ])
    expect(Math.abs(view.lon)).toBeCloseTo(180, 4)
    expect(view.lat).toBeCloseTo(0, 6)
  })

  it('posti sparsi su più di mezzo mondo tornano al mondo intero', () => {
    /* Non esiste un'inquadratura che li tenga tutti: allora si mostra la sfera
       come sta, invece di inventare un avvicinamento che ne nasconde metà. */
    const { zoom } = fitMarks([
      { lon: 0, lat: 0 },
      { lon: 100, lat: 0 },
      { lon: -100, lat: 0 },
    ])
    expect(zoom).toBe(1)
  })

  it('senza posti non si schianta: guarda l’Italia', () => {
    expect(fitMarks([])).toEqual({ view: { lon: 12, lat: 42 }, zoom: 1 })
  })

  it('l’avvicinamento resta fra i suoi limiti', () => {
    expect(clampZoom(0.2)).toBe(1)
    expect(clampZoom(1000)).toBe(MAX_ZOOM)
    expect(clampZoom(Number.NaN)).toBe(1)
    expect(clampZoom(3)).toBe(3)
  })
})

describe('puntini troppo vicini', () => {
  /* I cinque viaggi europei più New York: due continenti, cioè il caso in cui
     nessuna inquadratura va bene per tutti. */
  const EUROPA = [
    { id: 'germania', lon: 10.4, lat: 51.2 },
    { id: 'parigi', lon: 2.35, lat: 48.86 },
    { id: 'ortona', lon: 14.4, lat: 42.35 },
    { id: 'creta', lon: 24.81, lat: 35.24 },
    { id: 'sud-italia', lon: 16.2, lat: 39.5 },
  ]
  const NEW_YORK = { id: 'new-york', lon: -74.01, lat: 40.71 }
  const RAGGIO = 152

  /** Dove cadono i puntini con una certa inquadratura. */
  function posati(posti: readonly { id: string; lon: number; lat: number }[], framing: { view: { lon: number; lat: number }; zoom: number }) {
    return posti.flatMap((posto) => {
      const at = project(posto.lon, posto.lat, framing.view, RAGGIO * framing.zoom)
      return at ? [{ id: posto.id, at }] : []
    })
  }

  function minimaDistanza(punti: readonly { at: { x: number; y: number } }[]): number {
    let min = Infinity
    for (let i = 0; i < punti.length; i += 1) {
      for (let j = i + 1; j < punti.length; j += 1) {
        const a = punti[i]?.at
        const b = punti[j]?.at
        if (!a || !b) continue
        min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y))
      }
    }
    return min
  }

  it('un viaggio in un altro continente riporta l’Europa a un grumo di otto pixel', () => {
    /* Il numero che giustifica tutto il resto: senza New York la distanza
       minima è oltre 24px, con New York scende sotto i 10. */
    const soloEuropa = posati(EUROPA, fitMarks(EUROPA))
    expect(minimaDistanza(soloEuropa)).toBeGreaterThan(24)

    const conNewYork = [...EUROPA, NEW_YORK]
    const tutti = posati(conNewYork, fitMarks(conNewYork))
    expect(minimaDistanza(tutti)).toBeLessThan(10)
  })

  it('e allora quelli che si pestano diventano uno', () => {
    const conNewYork = [...EUROPA, NEW_YORK]
    const gruppi = groupNearby(posati(conNewYork, fitMarks(conNewYork)))
    /* Sei viaggi, tre puntini: l'Italia e la Grecia in un grumo, la Germania con
       Parigi, e New York da sola a un oceano di distanza. */
    expect(gruppi.map((g) => g.items.map((i) => i.id).sort())).toEqual([
      ['germania', 'parigi'],
      ['creta', 'ortona', 'sud-italia'],
      ['new-york'],
    ])
  })

  it('e i puntini che restano sono tutti mirabili, uno per uno', () => {
    const conNewYork = [...EUROPA, NEW_YORK]
    const gruppi = groupNearby(posati(conNewYork, fitMarks(conNewYork)))
    /* La garanzia vera: fra i puntini disegnati non ce ne sono due più vicini
       del bersaglio di un dito. */
    expect(minimaDistanza(gruppi)).toBeGreaterThanOrEqual(CLUSTER_DISTANCE)
  })

  it('toccando il gruppo, l’inquadratura dei suoi li separa', () => {
    const gruppo = [
      { id: 'ortona', lon: 14.4, lat: 42.35 },
      { id: 'sud-italia', lon: 16.2, lat: 39.5 },
    ]
    /* È `fitMarks` a fare il lavoro, quella già testata: il tocco sul gruppo
       non fa altro che inquadrare i suoi. */
    const dopo = posati(gruppo, fitMarks(gruppo))
    expect(minimaDistanza(dopo)).toBeGreaterThan(40)
  })

  it('due posti nello stesso punto restano un gruppo solo, senza girare a vuoto', () => {
    /* Il caso limite: due viaggi con le stesse coordinate. Inquadrarli non li
       separa, quindi chi disegna deve saperlo — qui basta che il gruppo esista
       e non si sdoppi. */
    const stessoPosto = [
      { id: 'a', lon: 12, lat: 42 },
      { id: 'b', lon: 12, lat: 42 },
    ]
    const gruppi = groupNearby(posati(stessoPosto, fitMarks(stessoPosto)))
    expect(gruppi).toHaveLength(1)
    expect(gruppi[0]?.items).toHaveLength(2)
    expect(fitMarks(stessoPosto).zoom).toBe(1)
  })
})
