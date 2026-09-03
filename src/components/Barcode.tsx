/**
 * Il codice a barre, in SVG.
 *
 * Non sa niente di codici a barre: riceve i moduli da `domain/barcode.ts` e li
 * disegna. Tutto ciò che c'è qui è al servizio del **lettore alla cassa**, che è
 * un utente con requisiti precisi:
 *
 * - **La zona di quiete è dentro il disegno**, non un margine del CSS: se una
 *   scheda o un bordo la mangiassero, il lettore non troverebbe l'inizio del
 *   codice. Sta nel `viewBox`, quindi scala con le barre e nessun foglio di
 *   stile la può togliere.
 * - **Il fondo è disegnato**, bianco esplicito: un codice a barre su fondo
 *   trasparente sopra il tema scuro è nero su nero.
 * - **`preserveAspectRatio="none"`** perché il codice riempia la larghezza e
 *   tenga un'altezza sua. Non deforma le proporzioni fra i moduli: lo
 *   stiramento è lo stesso per tutti, ed è la sola cosa che conta.
 * - **`shape-rendering="crispEdges"`** perché un modulo che cade a metà pixel
 *   verrebbe sfumato, e una barra grigia è una barra che il lettore può sbagliare.
 *
 * Le barre consecutive si fondono in un rettangolo solo: un EAN-13 passa da 95
 * elementi a una trentina, e su un elenco non cambia niente ma su una tessera
 * aperta è il disegno che il telefono ridipinge a ogni rotazione.
 */

import type { ReactNode } from 'react'

import type { Barcode as BarcodePattern } from '../domain/barcode'

/**
 * L'altezza del disegno in unità del `viewBox`, non in pixel: le proporzioni le
 * decide chi lo mette in pagina, con il CSS. Gli standard chiedono che
 * l'altezza sia almeno un quarto della larghezza, e a schermo lo è sempre.
 */
const HEIGHT = 100

interface Run {
  from: number
  width: number
}

/** Le barre, fuse: `1110011` diventa due rettangoli invece di cinque. */
function runsOf(modules: string): Run[] {
  const runs: Run[] = []
  let at = 0
  while (at < modules.length) {
    if (modules[at] !== '1') {
      at += 1
      continue
    }
    const from = at
    while (at < modules.length && modules[at] === '1') at += 1
    runs.push({ from, width: at - from })
  }
  return runs
}

export function Barcode({
  code,
  label,
}: {
  code: BarcodePattern
  /** Cosa c'è scritto dentro: per chi legge con la voce, il codice è opaco. */
  label: string
}): ReactNode {
  const width = code.quiet * 2 + code.modules.length
  return (
    <svg
      className="barcode"
      viewBox={`0 0 ${String(width)} ${String(HEIGHT)}`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Codice a barre: ${label}`}
    >
      {/* Il fondo bianco fa parte del codice, non della scheda che lo contiene. */}
      <rect x="0" y="0" width={width} height={HEIGHT} fill="#ffffff" />
      {runsOf(code.modules).map((run) => (
        <rect
          key={run.from}
          x={code.quiet + run.from}
          y="0"
          width={run.width}
          height={HEIGHT}
          fill="#000000"
        />
      ))}
    </svg>
  )
}
