/**
 * Etichette, emoji e colori delle categorie.
 *
 * Regola: il colore appartiene alla categoria, non alla sua posizione in
 * classifica. Le categorie con uno slot (0–7) hanno sempre la stessa tinta in
 * ogni grafico e in ogni mese; tutte le altre confluiscono in un'unica fetta
 * «Altre» grigia — non si genera mai una nona tinta, perché sotto daltonismo
 * sarebbe indistinguibile da una esistente.
 */

import type { CategorySlice } from './selectors'
import { SOURCE_LABELS, type Category, type Source } from './types'
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
  sourceLabel: (source: Source) => string
}

export function buildCategoryLookup(
  categories: readonly Category[],
  theme: ChartTheme,
): CategoryLookup {
  const byId = new Map(categories.map((c) => [c.id, c]))

  const slotOf = (id: string): number | undefined => {
    const category = byId.get(id)
    if (!category) return undefined
    if (typeof category.slot === 'number') return category.slot
    const index = categories.findIndex((c) => c.id === id)
    return index >= 0 && index < theme.series.length ? index : undefined
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
    sourceLabel: (source) => SOURCE_LABELS[source],
  }
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
