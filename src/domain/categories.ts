/**
 * Etichette, emoji e colori delle categorie.
 *
 * Regola: il colore appartiene alla categoria, non alla sua posizione in
 * classifica. Le categorie con uno slot (0–7) hanno sempre la stessa tinta in
 * ogni grafico e in ogni mese; tutte le altre confluiscono in un'unica fetta
 * «Altre» grigia — non si genera mai una nona tinta, perché sotto daltonismo
 * sarebbe indistinguibile da una esistente.
 */

import { categoryBreakdown, type CategorySlice } from './selectors'
import {
  sourceLabelOf,
  sourceTitleOf,
  type Category,
  type Expense,
  type PersonId,
  type Source,
  type SourceMap,
} from './types'
import type { ChartTheme } from '../theme/palette'

export const REST_KEY = '__altre__'
export const REST_LABEL = 'Altre voci'

/** Massimo di fette colorate in un grafico: oltre, si piega su «Altre». */
export const MAX_SLICES = 7
/** Massimo di serie in una barra impilata: la leggenda oltre non si legge più. */
export const MAX_STACK_SERIES = 5

export interface CategoryLookup {
  list: readonly Category[]
  label: (id: string) => string
  emoji: (id: string) => string
  color: (id: string) => string
  hasSlot: (id: string) => boolean
  subLabel: (categoryId: string, subId: string | undefined) => string
  /** Il nome del tricount, senza emoji: per il CSV e per le frasi. */
  sourceLabel: (source: Source) => string
  /** Emoji e nome, per i menù e le righe dell'interfaccia. */
  sourceTitle: (source: Source) => string
}

export function buildCategoryLookup(
  categories: readonly Category[],
  theme: ChartTheme,
  /** I tricount veri, dai dati. Quello che manca ricade sul generico. */
  sources: SourceMap = {},
): CategoryLookup {
  const byId = new Map(categories.map((c) => [c.id, c]))

  /*
   * Solo uno `slot` dichiarato dà un colore. Prima, una categoria senza slot lo
   * ereditava dalla propria posizione nell'elenco: finché le prime otto lo
   * avevano tutte dichiarato era codice morto, ma da quando le categorie si
   * creano dall'app una categoria nuova inserita fra le prime otto avrebbe
   * preso in silenzio la tinta di un'altra. → ADR-0029
   */
  const slotOf = (id: string): number | undefined => {
    const slot = byId.get(id)?.slot
    return typeof slot === 'number' ? slot : undefined
  }

  return {
    list: categories,
    label: (id) => {
      if (id === REST_KEY) return REST_LABEL
      return byId.get(id)?.label ?? id
    },
    emoji: (id) => (id === REST_KEY ? '▫️' : (byId.get(id)?.emoji ?? '•')),
    color: (id) => {
      if (id === REST_KEY) return theme.rest
      const slot = slotOf(id)
      return slot === undefined ? theme.rest : (theme.series[slot] ?? theme.rest)
    },
    hasSlot: (id) => id !== REST_KEY && slotOf(id) !== undefined,
    subLabel: (categoryId, subId) => {
      if (!subId) return 'Senza dettaglio'
      const sub = byId.get(categoryId)?.subcategories?.find((s) => s.id === subId)
      return sub?.label ?? subId
    },
    sourceLabel: (source) => sourceLabelOf(sources, source),
    sourceTitle: (source) => sourceTitleOf(sources, source),
  }
}

/** Quante tinte categoriali esistono. Non è un numero da alzare a occhio: → ADR-0029 */
export const SLOT_COUNT = 8

/**
 * Assegna uno slot di colore a una categoria, **scambiandolo** con chi lo aveva.
 *
 * Lo scambio non è un vezzo: due categorie sullo stesso slot avrebbero la stessa
 * tinta in tutti i grafici, e nel grafico a barre impilate diventerebbero due
 * segmenti confinanti identici. Chi cede lo slot prende quello che aveva l'altra
 * — spesso nessuno, e allora finisce in «Altre voci», che è la verità.
 */
export function withSlot(
  categories: readonly Category[],
  id: string,
  slot: number | undefined,
): Category[] {
  const target = categories.find((c) => c.id === id)
  if (!target) return [...categories]
  const previous = target.slot
  const holder = slot === undefined ? undefined : categories.find((c) => c.slot === slot && c.id !== id)

  return categories.map((category) => {
    const next = { ...category }
    if (category.id === id) {
      if (slot === undefined) delete next.slot
      else next.slot = slot
    } else if (holder && category.id === holder.id) {
      if (previous === undefined) delete next.slot
      else next.slot = previous
    }
    return next
  })
}

/**
 * Le categorie che una spesa può ancora usare dopo aver cancellato `id`, e dove
 * si possono spostare le sue spese.
 */
export function categoriesWithout(categories: readonly Category[], id: string): Category[] {
  return categories.filter((category) => category.id !== id)
}

/**
 * Tiene le prime `max` fette con uno slot di colore e piega tutto il resto in
 * un'unica voce «Altre», così una categoria non cambia mai colore fra due mesi.
 */
export function foldSlices(
  slices: readonly CategorySlice[],
  lookup: CategoryLookup,
  max: number = MAX_SLICES,
): CategorySlice[] {
  const kept: CategorySlice[] = []
  let restTotal = 0
  let restPct = 0
  let restCount = 0

  for (const slice of slices) {
    if (kept.length < max && lookup.hasSlot(slice.key)) {
      kept.push(slice)
      continue
    }
    restTotal += Math.round(slice.total * 100)
    restPct += slice.pct
    restCount += slice.count
  }

  if (restCount > 0) {
    kept.push({ key: REST_KEY, total: restTotal / 100, pct: restPct, count: restCount })
  }
  return kept
}

export interface LabelledSlice {
  key: string
  label: string
  value: number
  pct: number
  color: string
}

/** Da fette anonime a fette con etichetta e colore: lo vogliono torta, barre e leggende. */
export function labelSlices(
  slices: readonly CategorySlice[],
  lookup: CategoryLookup,
): LabelledSlice[] {
  return slices.map((slice) => ({
    key: slice.key,
    label: lookup.label(slice.key),
    value: slice.total,
    pct: slice.pct,
    color: lookup.color(slice.key),
  }))
}

/**
 * Le fette pronte per la torta, da un insieme di spese: la sequenza completa
 * **suddividi → piega → etichetta**.
 *
 * Sta qui perché l'ordine è logica e non stile — piegare dopo aver etichettato
 * produrrebbe una fetta «Altre» con l'etichetta di un'altra categoria — e
 * perché la stessa riga era ripetuta in tre pagine, dove la quarta l'avrebbe
 * copiata a occhio dalla terza.
 */
export function donutSlices(
  scope: readonly Expense[],
  person: PersonId,
  lookup: CategoryLookup,
): LabelledSlice[] {
  return labelSlices(foldSlices(categoryBreakdown(scope, person), lookup), lookup)
}

/**
 * Serie per le barre impilate: si scelgono le categorie che spendono più, ma si
 * ordinano per slot di colore. Nelle barre i segmenti si toccano, e l'ordine
 * degli slot è quello su cui è stata verificata la separazione delle tinte
 * (anche per chi non distingue rosso e verde): tenerlo significa che due
 * segmenti confinanti sono sempre una coppia già validata.
 */
export function stackSeriesKeys(
  slices: readonly CategorySlice[],
  lookup: CategoryLookup,
  max: number = MAX_STACK_SERIES,
): string[] {
  const folded = foldSlices(slices, lookup, max)
  const order = new Map(lookup.list.map((category, index) => [category.id, category.slot ?? index]))
  return folded
    .map((slice) => slice.key)
    .sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER))
}
