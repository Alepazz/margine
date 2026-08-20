/**
 * Il mappamondo dei viaggi: si trascina per girarlo, si pizzica per avvicinarlo,
 * si tocca un puntino per aprire quel viaggio.
 *
 * Su tela e non in SVG: il contorno delle terre sono cinquemila vertici, e
 * ridisegnarli come nodi del DOM a ogni frame di trascinamento farebbe scattare
 * il gesto. Su tela è un ciclo di disegno e resta fluido. → ADR-0020
 *
 * L'inquadratura di partenza **stringe sui viaggi** invece di mostrare mezzo
 * mondo: a zoom 1 cinque viaggi europei cadono in un fazzoletto di quaranta
 * pixel, due di essi a otto pixel l'uno dall'altro, e mirarli è impossibile.
 * Ogni puntino porta il suo nome accanto, così si vede che è roba da toccare e
 * quale si sta toccando. → ADR-0021
 *
 * La tela però è opaca a chi non vede: sotto il globo c'è la stessa lista come
 * pulsanti veri, quindi il mappamondo è un modo in più di arrivare a un viaggio,
 * mai l'unico.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import {
  clampZoom,
  drag,
  fitMarks,
  MAX_ZOOM,
  MIN_ZOOM,
  project,
  type Framing,
  type ScreenPoint,
} from '../../domain/globe'
import { LAND } from '../../domain/globe-land'
import type { Trip } from '../../domain/types'
import { useChartTheme } from '../../theme/theme'

export interface GlobeMark {
  trip: Trip
  lat: number
  lon: number
  approx: boolean
  label: string
}

/** Oltre questo movimento il gesto è un trascinamento, non un tocco. */
const TAP_SLOP = 8
const DOT_RADIUS = 6
/** Quanto largo è il bersaglio di un puntino: il dito non è un puntatore. */
const HIT_RADIUS = 20
/** Un pizzico più corto di così è una mano che trema, non un gesto. */
const PINCH_SLOP = 6
const LABEL_SIZE = 12
const LABEL_HEIGHT = 16

interface Placed {
  mark: GlobeMark
  at: ScreenPoint
}

interface LabelBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

export function Globe({
  marks,
  selected,
  height = 320,
  onSelect,
}: {
  marks: readonly GlobeMark[]
  /** Il viaggio aperto adesso: sul globo si accende. */
  selected?: string | null
  height?: number
  onSelect: (tripId: string) => void
}): ReactNode {
  const theme = useChartTheme()
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const box = useRef<HTMLDivElement | null>(null)
  const fontFamily = useRef('')
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<string | null>(null)

  /*
   * L'inquadratura si rifà quando cambiano **i posti**, non quando cambia
   * l'array che li contiene: se chi ci chiama ricrea la lista a ogni render,
   * rifarla azzererebbe il trascinamento a metà gesto. La chiave determina
   * interamente le coordinate, quindi leggere `marks` qui dentro è sicuro.
   */
  const marksKey = marks.map((mark) => `${mark.trip.id}:${mark.lon},${mark.lat}`).join('|')
  const fitted = useMemo(() => fitMarks(marks), [marksKey])
  const [frame, setFrame] = useState<Framing>(fitted)

  /* Cambiare anno cambia i viaggi mostrati, e con essi l'inquadratura giusta. */
  useEffect(() => setFrame(fitted), [fitted])

  /*
   * I puntatori attivi. Servono contati, non uno solo: con due dita il gesto è
   * un pizzico, e trattarlo come un trascinamento farebbe girare il globo
   * mentre si prova ad avvicinarlo.
   */
  const pointers = useRef(new Map<number, ScreenPoint>())
  const gesture = useRef({ moved: 0, pinched: false, span: 0 })

  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  /* Il disco resta fermo; è la sfera che si ingrandisce. */
  const radius = Math.max(40, Math.min(width, height) / 2 - 8)
  const sphere = radius * frame.zoom

  /** Dove cade ogni viaggio adesso: serve al disegno e al bersaglio del tocco. */
  const placed = useMemo<Placed[]>(() => {
    const out: Placed[] = []
    for (const mark of marks) {
      const at = project(mark.lon, mark.lat, frame.view, sphere)
      if (!at) continue
      /* Avvicinando, la faccia visibile è più grande del disco: quello che cade
         fuori non si disegna e non si può toccare. */
      if (Math.hypot(at.x, at.y) > radius) continue
      out.push({ mark, at })
    }
    return out
  }, [marks, radius, sphere, frame.view])

  useEffect(() => {
    const el = canvas.current
    if (!el || width === 0) return
    const dpr = window.devicePixelRatio || 1
    el.width = Math.round(width * dpr)
    el.height = Math.round(height * dpr)
    const ctx = el.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.save()
    ctx.translate(width / 2, height / 2)

    // L'oceano: il disco della sfera.
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.fillStyle = theme.surface
    ctx.fill()

    /* Il mondo sta dentro il disco: avvicinando, senza questo taglio le terre
       colerebbero fuori dalla sfera. */
    ctx.save()
    ctx.clip()

    // I paralleli e i meridiani, appena accennati: danno il senso della sfera.
    ctx.strokeStyle = theme.grid
    ctx.lineWidth = 1
    /* Avvicinando, una maglia da 30° esce dall'inquadratura e la sfera perde il
       suo unico riferimento: si infittisce. */
    const mesh = frame.zoom >= 4 ? 10 : 30
    const step = Math.max(0.5, 4 / frame.zoom)
    for (let lat = -60; lat <= 60; lat += mesh) {
      ctx.stroke(pathOf(latitudeRing(lat, step), frame.view, sphere))
    }
    for (let lon = -180; lon < 180; lon += mesh) {
      ctx.stroke(pathOf(meridian(lon, step), frame.view, sphere))
    }

    // Le terre.
    ctx.fillStyle = theme.grid
    ctx.strokeStyle = theme.axis
    ctx.lineWidth = 0.6
    for (const ring of LAND) {
      const path = pathOf(ring, frame.view, sphere)
      ctx.fill(path)
      ctx.stroke(path)
    }

    ctx.restore()

    // Il bordo della sfera, sopra le terre che lo toccano.
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.strokeStyle = theme.axis
    ctx.lineWidth = 1
    ctx.stroke()

    // I viaggi.
    const accent = theme.series[0] ?? theme.ink
    for (const { mark, at } of placed) {
      const isSelected = mark.trip.id === selected
      const isHover = mark.trip.id === hover
      /* Posizione approssimata: un cerchio intorno, invece di far credere a una
         precisione che «Germania» non ha. */
      if (mark.approx) {
        ctx.beginPath()
        ctx.arc(at.x, at.y, DOT_RADIUS + 5, 0, Math.PI * 2)
        ctx.strokeStyle = theme.muted
        ctx.lineWidth = 1
        ctx.stroke()
      }
      if (isSelected || isHover) {
        ctx.beginPath()
        ctx.arc(at.x, at.y, DOT_RADIUS + 9, 0, Math.PI * 2)
        ctx.strokeStyle = accent
        ctx.lineWidth = isSelected ? 2 : 1
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(at.x, at.y, isSelected ? DOT_RADIUS + 2 : DOT_RADIUS, 0, Math.PI * 2)
      ctx.fillStyle = isSelected ? accent : theme.ink
      ctx.fill()
      ctx.strokeStyle = theme.surface
      ctx.lineWidth = 2
      ctx.stroke()
    }

    /*
     * I nomi accanto ai puntini. Sono la ragione per cui si capisce che un
     * puntino è roba da toccare, e quale si sta per toccare — un disco con dei
     * pallini muti non si legge come un elenco di posti.
     *
     * Il posto per l'etichetta si cerca fra quattro candidati e chi arriva dopo
     * cede: due nomi sovrapposti sono peggio di un nome mancante. Il selezionato
     * chiede per primo, così il suo non manca mai.
     */
    /* Il carattere arriva dai token, non da un valore scritto qui — ma si legge
       una volta: `getComputedStyle` forza un ricalcolo dello stile, e a sessanta
       fotogrammi di trascinamento al secondo sarebbero sessanta ricalcoli. */
    if (!fontFamily.current) fontFamily.current = window.getComputedStyle(el).fontFamily
    ctx.font = `600 ${LABEL_SIZE}px ${fontFamily.current}`
    ctx.textBaseline = 'middle'
    const taken: LabelBox[] = []
    const ordered = [...placed].sort((a, b) => {
      const rank = (entry: Placed) => (entry.mark.trip.id === selected ? 0 : 1)
      return rank(a) - rank(b)
    })
    for (const { mark, at } of ordered) {
      const isSelected = mark.trip.id === selected
      const spot = placeLabel(ctx, mark.label, at, taken, radius)
      if (!spot) continue
      const textWidth = ctx.measureText(mark.label).width
      /* Un piatto pieno sotto il nome: sopra le terre, il testo nudo si perde. */
      ctx.fillStyle = theme.surface
      ctx.fillRect(spot.x - 3, spot.y - LABEL_HEIGHT / 2, textWidth + 6, LABEL_HEIGHT)
      ctx.fillStyle = isSelected ? accent : theme.ink
      ctx.fillText(mark.label, spot.x, spot.y)
    }

    ctx.restore()
  }, [frame.view, frame.zoom, height, hover, placed, radius, selected, sphere, theme, width])

  /** Il puntino sotto un punto dello schermo, o niente. */
  const hit = (clientX: number, clientY: number): string | null => {
    const el = canvas.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left - width / 2
    const y = clientY - rect.top - height / 2
    let best: { id: string; d: number } | null = null
    for (const { mark, at } of placed) {
      const d = Math.hypot(at.x - x, at.y - y)
      if (d <= HIT_RADIUS && (!best || d < best.d)) best = { id: mark.trip.id, d }
    }
    return best?.id ?? null
  }

  const zoomBy = (factor: number) =>
    setFrame((current) => ({ ...current, zoom: clampZoom(current.zoom * factor) }))

  const canZoomIn = frame.zoom < MAX_ZOOM - 1e-6
  const canZoomOut = frame.zoom > MIN_ZOOM + 1e-6

  return (
    <div className="globe" ref={box} style={{ height }}>
      <canvas
        ref={canvas}
        className="globe-canvas"
        style={{ width: '100%', height, cursor: hover ? 'pointer' : 'grab' }}
        role="img"
        aria-label={`Mappamondo con ${marks.length} ${marks.length === 1 ? 'viaggio' : 'viaggi'}. L'elenco sotto porta agli stessi viaggi.`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
          if (pointers.current.size === 1) gesture.current = { moved: 0, pinched: false, span: 0 }
          else gesture.current.span = span(pointers.current)
        }}
        onPointerMove={(event) => {
          const active = pointers.current
          const previous = active.get(event.pointerId)
          if (!previous) {
            /* Nessun dito giù: è solo il mouse che passa sopra. */
            setHover(hit(event.clientX, event.clientY))
            return
          }
          const dx = event.clientX - previous.x
          const dy = event.clientY - previous.y
          active.set(event.pointerId, { x: event.clientX, y: event.clientY })

          if (active.size >= 2) {
            const now = span(active)
            const before = gesture.current.span
            if (before > 0 && Math.abs(now - before) > PINCH_SLOP) {
              gesture.current.pinched = true
              gesture.current.span = now
              setFrame((current) => ({ ...current, zoom: clampZoom(current.zoom * (now / before)) }))
            }
            return
          }

          gesture.current.moved += Math.abs(dx) + Math.abs(dy)
          setFrame((current) => ({ ...current, view: drag(current.view, dx, dy, sphere) }))
        }}
        onPointerUp={(event) => {
          const active = pointers.current
          active.delete(event.pointerId)
          const state = gesture.current
          /* Alzare un dito dopo un pizzico non è un tocco; e un trascinamento
             non è un tocco, altrimenti girare il globo aprirebbe un viaggio a
             caso ogni volta che si alza il dito. */
          if (active.size > 0 || state.pinched || state.moved > TAP_SLOP) return
          const id = hit(event.clientX, event.clientY)
          if (id) onSelect(id)
        }}
        onPointerCancel={(event) => {
          pointers.current.delete(event.pointerId)
        }}
        onPointerLeave={() => setHover(null)}
      />
      <div className="globe-zoom">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-label="Allontana il mappamondo"
          disabled={!canZoomOut}
          onClick={() => zoomBy(1 / 1.5)}
        >
          −
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-label="Avvicina il mappamondo"
          disabled={!canZoomIn}
          onClick={() => zoomBy(1.5)}
        >
          +
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-label="Torna a inquadrare tutti i viaggi"
          onClick={() => setFrame(fitted)}
        >
          ⌖
        </button>
      </div>
    </div>
  )
}

/** La distanza fra due dita: la misura del pizzico. */
function span(pointers: Map<number, ScreenPoint>): number {
  const [first, second] = [...pointers.values()]
  if (!first || !second) return 0
  return Math.hypot(first.x - second.x, first.y - second.y)
}

/**
 * Dove sta il nome di un puntino. Quattro candidati in ordine di preferenza; il
 * primo che non esce dal disco e non pesta un'etichetta già messa vince.
 */
function placeLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  at: ScreenPoint,
  taken: LabelBox[],
  radius: number,
): ScreenPoint | null {
  const w = ctx.measureText(text).width
  const candidates: ScreenPoint[] = [
    { x: at.x + DOT_RADIUS + 8, y: at.y },
    { x: at.x - DOT_RADIUS - 8 - w, y: at.y },
    { x: at.x - w / 2, y: at.y + DOT_RADIUS + 14 },
    { x: at.x - w / 2, y: at.y - DOT_RADIUS - 14 },
  ]
  for (const spot of candidates) {
    const b: LabelBox = {
      x0: spot.x - 3,
      y0: spot.y - LABEL_HEIGHT / 2,
      x1: spot.x + w + 3,
      y1: spot.y + LABEL_HEIGHT / 2,
    }
    if (b.x0 < -radius || b.x1 > radius || b.y0 < -radius || b.y1 > radius) continue
    if (taken.some((t) => b.x1 > t.x0 && b.x0 < t.x1 && b.y1 > t.y0 && b.y0 < t.y1)) continue
    taken.push(b)
    return spot
  }
  return null
}

/**
 * Il tracciato di una sequenza di punti sulla sfera.
 *
 * **Il pezzo dietro l'orizzonte interrompe il tracciato**: continuarlo
 * taglierebbe il globo con una corda. È il dettaglio delicato del disegno, e sta
 * qui una volta sola — serve identico ai paralleli e ai contorni delle terre,
 * che poi lo riempiono invece di tracciarlo.
 */
function pathOf(
  points: readonly (readonly [number, number])[],
  view: { lon: number; lat: number },
  radius: number,
): Path2D {
  const path = new Path2D()
  let started = false
  for (const [lon, lat] of points) {
    const point = project(lon, lat, view, radius)
    if (!point) {
      started = false
      continue
    }
    if (started) path.lineTo(point.x, point.y)
    else {
      path.moveTo(point.x, point.y)
      started = true
    }
  }
  return path
}

function latitudeRing(lat: number, step: number): [number, number][] {
  const out: [number, number][] = []
  for (let lon = -180; lon <= 180; lon += step) out.push([lon, lat])
  return out
}

function meridian(lon: number, step: number): [number, number][] {
  const out: [number, number][] = []
  for (let lat = -80; lat <= 80; lat += step) out.push([lon, lat])
  return out
}
