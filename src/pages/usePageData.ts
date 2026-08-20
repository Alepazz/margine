/** Dati derivati che servono a quasi tutte le pagine, calcolati una volta. */

import { useMemo } from 'react'

import { useReadyStore, type ReadyStore } from '../data/store'
import { buildCategoryLookup, type CategoryLookup } from '../domain/categories'
import { todayIso } from '../domain/dates'
import { allFor, monthlySeries, visibleFor, type MonthTotal } from '../domain/selectors'
import type { Expense } from '../domain/types'
import type { ChartTheme } from '../theme/palette'
import { useChartTheme } from '../theme/theme'

export interface PageData extends ReadyStore {
  lookup: CategoryLookup
  chart: ChartTheme
  /** Spese della persona selezionata, con la scelta su vacanze sì/no applicata. */
  visible: Expense[]
  /** Spese della persona selezionata, vacanze sempre incluse. */
  all: Expense[]
  series: MonthTotal[]
  today: string
}

export function usePageData(): PageData {
  const store = useReadyStore()
  const chart = useChartTheme()
  const { expenses } = store.dataset
  const { person } = store.view

  const lookup = useMemo(
    () => buildCategoryLookup(store.config.categories, chart, store.config.sourceLabels),
    [store.config.categories, store.config.sourceLabels, chart],
  )
  const visible = useMemo(() => visibleFor(expenses, store.view), [expenses, store.view])
  const all = useMemo(() => allFor(expenses, person), [expenses, person])
  const series = useMemo(() => monthlySeries(visible, person), [visible, person])

  return { ...store, lookup, chart, visible, all, series, today: todayIso() }
}
