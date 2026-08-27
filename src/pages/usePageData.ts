/** Dati derivati che le pagine condividono, calcolati una volta. */

import { useMemo } from 'react'

import { useReadyStore, type ReadyStore } from '../data/store'
import { buildCategoryLookup, type CategoryLookup } from '../domain/categories'
import { todayIso } from '../domain/dates'
import {
  allFor,
  coupleBalance,
  monthlySeries,
  vacationIdsOf,
  visibleFor,
  type CoupleBalance,
  type MonthTotal,
} from '../domain/selectors'
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
    () => buildCategoryLookup(store.config.categories, chart, store.dataset.tricounts),
    [store.config.categories, store.dataset.tricounts, chart],
  )
  const vacationIds = useMemo(() => vacationIdsOf(store.dataset.tricounts), [store.dataset.tricounts])
  const visible = useMemo(
    () => visibleFor(expenses, store.view, vacationIds),
    [expenses, store.view, vacationIds],
  )
  const all = useMemo(() => allFor(expenses, person), [expenses, person])
  const series = useMemo(() => monthlySeries(visible, person), [visible, person])

  return { ...store, lookup, chart, visible, all, series, today: todayIso() }
}

/**
 * Il saldo fra le due persone, con le stesse opzioni ovunque.
 *
 * Sta qui e non nelle pagine perché a mostrarlo sono **tre** — Riepilogo,
 * Esplora e Saldo — e devono mostrare lo stesso numero: un'anteprima dell'hub
 * che dicesse una cifra diversa dalla sua pagina toglierebbe la ragione
 * dell'hub (→ ADR-0044). Con la chiamata ripetuta in tre posti, `today` o le
 * opzioni potevano divergere in uno solo e nessun test se ne sarebbe accorto.
 *
 * Non è dentro `usePageData` di proposito: lo usano tre pagine su undici, e le
 * altre otto non hanno motivo di pagare una passata su tutte le spese.
 */
export function useCoupleBalance(): CoupleBalance {
  const { config, dataset } = useReadyStore()
  const today = todayIso()
  return useMemo(
    () => coupleBalance(dataset.expenses, dataset.settlements, { ...config.balance, today }),
    [config.balance, dataset.expenses, dataset.settlements, today],
  )
}
