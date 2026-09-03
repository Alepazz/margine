/**
 * L'osservatorio dei prezzi: mettere in fila le rilevazioni per rispondere a una
 * domanda sola — davanti allo scaffale, quanto costa altrove.
 *
 * Le rilevazioni non sono spese (→ ADR-0041): niente quote, niente tricount,
 * niente margine. Qui dentro non entra nulla di tutto quello, ed è il motivo per
 * cui questo file sta accanto agli altri di `domain/` invece che dentro
 * `selectors.ts`.
 *
 * Due cose valgono la pena di essere dette prima del codice.
 *
 * **L'identità di un prodotto è il suo nome normalizzato.** Non c'è un elenco da
 * gestire: si scrive, e l'app suggerisce quello che è già stato scritto. Perché
 * il confronto funzioni, «Passata di pomodoro» e «passata  di pomodoro» devono
 * essere lo stesso prodotto, e questo lo fa `nameKey` (in `domain/text.ts`, che
 * è neutro perché la stessa normalizzazione serve alle spese ricorrenti). Un
 * refuso vero — «pasata» — crea invece un prodotto nuovo: è il prezzo dichiarato
 * di non avere schermate di gestione, e si corregge cancellando la rilevazione.
 *
 * **I confronti si fanno in centesimi interi.** Non è pignoleria: `(2,15 − 2,00)
 * / 2,00` in virgola mobile dà 0,0749999… e arrotonda a «+7%», mentre
 * `(215 − 200) / 200` dà 0,075 e arrotonda a «+8%». Il numero che si vede a
 * schermo cambia. → ADR-0008
 */

import { toCents } from './money'
import { nameKey } from './text'
import type { PriceEntry, PriceUnit } from './types'

/** Quante grafie proporre mentre si scrive: sei stanno in due righe sul telefono. */
const SUGGESTIONS = 6

export const PRICE_UNITS: readonly PriceUnit[] = ['kg', 'l', 'pezzo'] as const

/** Come si scrive l'unità accanto a un numero: «2,15 €/kg». */
export const UNIT_LABEL: Record<PriceUnit, string> = {
  kg: '€/kg',
  l: '€/L',
  pezzo: '€/pezzo',
}

/** Come si sceglie l'unità in un controllo segmentato. */
export const UNIT_CHOICE: Record<PriceUnit, string> = {
  kg: 'al kg',
  l: 'al litro',
  pezzo: 'al pezzo',
}

/** Una rilevazione con la sua posizione nell'elenco: serve a sciogliere i pari data. */
interface Stamped {
  entry: PriceEntry
  at: number
}

/**
 * La più recente di due rilevazioni. A pari data vince **l'ultima inserita**, che
 * è quella con l'indice più alto: l'elenco cresce per aggiunta, quindi se in un
 * giorno lo stesso prezzo è stato corretto due volte la seconda è la buona.
 */
function later(a: Stamped, b: Stamped): Stamped {
  if (b.entry.date > a.entry.date) return b
  if (b.entry.date === a.entry.date && b.at > a.at) return b
  return a
}

/** Dalla più recente alla più vecchia, con lo stesso criterio di `later`. */
function byRecency(a: Stamped, b: Stamped): number {
  if (a.entry.date !== b.entry.date) return a.entry.date < b.entry.date ? 1 : -1
  return b.at - a.at
}

export interface PriceRow {
  /** Il supermercato, con la grafia della sua rilevazione più recente. */
  store: string
  /** Il prezzo che conta: l'ultimo visto qui. */
  latest: PriceEntry
  /** Tutto lo storico in questo supermercato, dal più recente. */
  history: PriceEntry[]
  /**
   * Quanto costa in più del migliore del gruppo, come frazione (0,12 = +12%).
   * Zero per il migliore, `null` se il migliore è a zero — che la validazione
   * esclude, ma un dato scritto a mano no.
   */
  overBest: number | null
}

export interface ProductGroup {
  /** Univoca: l'unità viene da un insieme chiuso, quindi il prefisso non è ambiguo. */
  key: string
  /** Il nome del prodotto, con la grafia della rilevazione più recente. */
  product: string
  unit: PriceUnit
  /** Un supermercato per riga, **dal più conveniente**: la prima è la migliore. */
  rows: PriceRow[]
  /** La data della rilevazione più recente del gruppo. */
  updated: string
}

/**
 * Il tabellone: un gruppo per prodotto **e unità**.
 *
 * Due unità sullo stesso nome fanno due gruppi, di proposito: 2,15 €/kg e
 * 1,80 €/pezzo non si confrontano, e affiancarli produrrebbe un «migliore» che
 * non vuol dire niente. Se è un refuso, la validazione dell'import lo segnala.
 */
export function priceBoard(prices: readonly PriceEntry[]): ProductGroup[] {
  const groups = new Map<string, { unit: PriceUnit; stores: Map<string, Stamped[]> }>()

  prices.forEach((entry, at) => {
    const key = `${entry.unit}:${nameKey(entry.product)}`
    let group = groups.get(key)
    if (!group) {
      group = { unit: entry.unit, stores: new Map() }
      groups.set(key, group)
    }
    const storeKey = nameKey(entry.store)
    const list = group.stores.get(storeKey)
    if (list) list.push({ entry, at })
    else group.stores.set(storeKey, [{ entry, at }])
  })

  const board: ProductGroup[] = []

  for (const [key, group] of groups) {
    const latests: Stamped[] = []
    const rows: { row: Omit<PriceRow, 'overBest'>; cents: number }[] = []

    for (const list of group.stores.values()) {
      const latest = list.reduce(later)
      latests.push(latest)
      rows.push({
        row: {
          store: latest.entry.store.trim(),
          latest: latest.entry,
          history: [...list].sort(byRecency).map((stamped) => stamped.entry),
        },
        cents: toCents(latest.entry.price),
      })
    }

    /* Il prezzo prima del nome: il migliore è il primo, ed è quello che la
       pagina evidenzia. Il nome scioglie i pari, così l'ordine non dipende
       dall'ordine di inserimento. */
    rows.sort((a, b) => a.cents - b.cents || a.row.store.localeCompare(b.row.store, 'it'))

    const bestCents = rows[0]?.cents ?? 0
    const newest = latests.reduce(later)
    const withDelta: PriceRow[] = rows.map(({ row, cents }) => ({
      ...row,
      overBest: bestCents === 0 ? null : (cents - bestCents) / bestCents,
    }))
    if (withDelta.length === 0) continue

    board.push({
      key,
      product: newest.entry.product.trim(),
      unit: group.unit,
      rows: withDelta,
      updated: newest.entry.date,
    })
  }

  return board.sort((a, b) => a.product.localeCompare(b.product, 'it') || a.unit.localeCompare(b.unit))
}

/** I gruppi che contengono la ricerca, nel nome del prodotto o in un supermercato. */
export function filterBoard(board: readonly ProductGroup[], query: string): ProductGroup[] {
  const needle = nameKey(query)
  if (needle === '') return [...board]
  return board.filter(
    (group) =>
      nameKey(group.product).includes(needle) ||
      group.rows.some((row) => nameKey(row.store).includes(needle)),
  )
}

/**
 * Le grafie già usate che somigliano a quello che si sta scrivendo, dalla più
 * recente. Serve a quattro campi — prodotto e supermercato dei prezzi, cosa e
 * negozio della lista — perché il problema è lo stesso: riusare un suggerimento
 * è ciò che tiene unita una serie.
 *
 * «Più recente» è l'ordine dell'elenco, non la data della rilevazione: l'elenco
 * cresce per aggiunta, e quello che conta è cosa hai scritto per ultimo.
 *
 * **Quello che è già scritto per intero non si propone**: sarebbe un pulsante
 * che non fa niente. Il filtro sta qui e non nei moduli perché lo vogliono
 * tutti, e scritto fuori era già diventato due copie della stessa riga.
 */
export function suggest(values: readonly string[], query: string): string[] {
  const needle = nameKey(query)
  const seen = new Set<string>()
  const out: string[] = []
  for (let i = values.length - 1; i >= 0 && out.length < SUGGESTIONS; i -= 1) {
    const raw = values[i]
    if (raw === undefined) continue
    const key = nameKey(raw)
    if (key === '' || seen.has(key)) continue
    seen.add(key)
    if (needle !== '' && !key.includes(needle)) continue
    if (key === needle) continue
    out.push(raw.trim())
  }
  return out
}

/**
 * L'unità con cui quel prodotto è già stato rilevato, per preselezionarla.
 *
 * Non è un vincolo — resta cambiabile nel modulo — ma è l'unica cosa che evita
 * di spaccare in due gruppi un prodotto che si vuole confrontare, sbagliando un
 * tocco.
 */
export function unitOf(prices: readonly PriceEntry[], product: string): PriceUnit | undefined {
  const key = nameKey(product)
  if (key === '') return undefined
  for (let i = prices.length - 1; i >= 0; i -= 1) {
    const entry = prices[i]
    if (entry && nameKey(entry.product) === key) return entry.unit
  }
  return undefined
}
