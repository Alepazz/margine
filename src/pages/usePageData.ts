/** Dati derivati che le pagine condividono, calcolati una volta. */

import { useMemo } from 'react'

import { useReadyStore, type ReadyStore } from '../data/store'
import { buildCategoryLookup, type CategoryLookup } from '../domain/categories'
import { todayIso } from '../domain/dates'
import {
  allFor,
  coupleBalance,
  monthlySeries,
  offBudgetIdsOf,
  perimeterOf,
  projectStats,
  visibleFor,
  type CoupleBalance,
  type MonthTotal,
  type ProjectStats,
} from '../domain/selectors'
import { projectsOf, type Expense } from '../domain/types'
import type { ChartTheme } from '../theme/palette'
import { useChartTheme } from '../theme/theme'

export interface PageData extends ReadyStore {
  lookup: CategoryLookup
  chart: ChartTheme
  /** Spese della persona selezionata, con la scelta su vacanze sì/no applicata. */
  visible: Expense[]
  /** Spese della persona selezionata, vacanze sempre incluse. */
  all: Expense[]
  /**
   * Tutte le spese **meno quelle dei progetti**. Non è `all` meno i progetti:
   * `all` tiene solo quelle in cui la persona ha una quota, questo no — le
   * raccolte che lo usano leggevano `dataset.expenses` grezzo e devono
   * continuare a vedere lo stesso insieme.
   *
   * È il perimetro delle raccolte che misurano una media — Casa, il gatto, le
   * loro anteprime nell'hub: un capitale in un mese porterebbe via da solo la
   * «media al mese» di una pagina che parla di bollette. Il progetto ha la sua
   * pagina, dove quel numero significa qualcosa.
   *
   * Non è il perimetro di **tutte** le pagine che leggono le spese: il 730 le
   * vuole tutte (le spese di un rogito si detraggono eccome) e la pagina Spese
   * pure, perché è l'archivio e non una misura. → ADR-0074
   */
  everyday: Expense[]
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
  const perimeter = useMemo(() => perimeterOf(store.dataset.tricounts), [store.dataset.tricounts])
  const visible = useMemo(
    () => visibleFor(expenses, store.view, perimeter),
    [expenses, store.view, perimeter],
  )
  const all = useMemo(() => allFor(expenses, person), [expenses, person])
  const everyday = useMemo(
    () => expenses.filter((e) => !perimeter.offBudget.has(e.tricount)),
    [expenses, perimeter],
  )
  const series = useMemo(() => monthlySeries(visible, person), [visible, person])

  return { ...store, lookup, chart, visible, all, everyday, series, today: todayIso() }
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
  /* I progetti hanno un saldo loro: qui non entrano, e a dirlo è **questo**
     posto, che è l'unico che costruisce il saldo di ogni giorno. → ADR-0074 */
  const offBudget = useMemo(() => offBudgetIdsOf(dataset.tricounts), [dataset.tricounts])
  return useMemo(
    () =>
      coupleBalance(dataset.expenses, dataset.settlements, { ...config.balance, today, offBudget }),
    [config.balance, dataset.expenses, dataset.settlements, offBudget, today],
  )
}

/**
 * Il conto di ogni progetto, con le stesse opzioni ovunque.
 *
 * Sta qui per la ragione di `useCoupleBalance()`, che è la stessa: a mostrarlo
 * sono **tre** pagine — la sua, l'anteprima nell'hub e l'avviso nel Saldo — e
 * devono dire lo stesso numero. Un'anteprima che dicesse una cifra diversa dalla
 * pagina che apre toglierebbe la ragione dell'hub (→ ADR-0044), e con la
 * chiamata ripetuta in tre posti `today` poteva divergere in uno solo senza che
 * nessun test se ne accorgesse. → ADR-0074
 *
 * Il Riepilogo **non** passa da qui, ed è voluto: lui chiede «quanto è uscito
 * fuori dai conti nel mese scelto», e il mese scelto può essere futuro, mentre
 * `projectStats` taglia il futuro come fa il saldo (→ ADR-0064). Userebbe un
 * insieme più corto e la riga sparirebbe in silenzio proprio dove serve.
 */
export function useProjects(): ProjectStats[] {
  const { dataset } = useReadyStore()
  const today = todayIso()
  return useMemo(
    () =>
      projectsOf(dataset.tricounts).map((tricount) =>
        projectStats(dataset.expenses, dataset.settlements, tricount, today),
      ),
    [dataset.expenses, dataset.settlements, dataset.tricounts, today],
  )
}
