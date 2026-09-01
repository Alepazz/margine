/** Dati derivati che le pagine condividono, calcolati una volta. */

import { useMemo } from 'react'

import { useReadyStore, type ReadyStore } from '../data/store'
import { buildCategoryLookup, type CategoryLookup } from '../domain/categories'
import { monthKeyOf, monthNameOf, todayIso } from '../domain/dates'
import { formatEuro } from '../domain/money'
import {
  allFor,
  coupleBalance,
  isCapital,
  monthlySeries,
  recurringDeltaOf,
  projectStats,
  vacationIdsOf,
  visibleFor,
  type CoupleBalance,
  type MonthTotal,
  type ProjectStats,
} from '../domain/selectors'
import { diCuiLabel } from '../domain/text'
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
   * Tutte le spese **meno il capitale**. Non è `all` meno il capitale: `all`
   * tiene solo quelle in cui la persona ha una quota, questo no — le raccolte
   * che lo usano leggevano `dataset.expenses` grezzo e devono continuare a
   * vedere lo stesso insieme.
   *
   * È il perimetro delle raccolte che misurano una media — Casa, il gatto, le
   * loro anteprime nell'hub: un rogito porterebbe via da solo la «media al
   * mese» di una pagina che parla di bollette. La rata del mutuo e il frigo
   * invece ci restano, perché quelli una media la fanno per davvero.
   *
   * Non è il perimetro di **tutte** le pagine che leggono le spese: il 730 le
   * vuole tutte (le spese di un rogito si detraggono eccome) e la pagina Spese
   * pure, perché è l'archivio e non una misura. → ADR-0079, ADR-0074
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
  const vacations = useMemo(() => vacationIdsOf(store.dataset.tricounts), [store.dataset.tricounts])
  const visible = useMemo(
    () => visibleFor(expenses, store.view, vacations),
    [expenses, store.view, vacations],
  )
  const all = useMemo(() => allFor(expenses, person), [expenses, person])
  const everyday = useMemo(() => expenses.filter((e) => !isCapital(e)), [expenses])
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
  return useMemo(
    () => coupleBalance(dataset.expenses, dataset.settlements, { ...config.balance, today }),
    [config.balance, dataset.expenses, dataset.settlements, today],
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
 * Il Riepilogo lo usa per la **barra dei rimborsi**, che è uno stato e non una
 * statistica del mese: non cambia col mese scelto, come il saldo (→ ADR-0058).
 * La riga «fuori da questi conti» invece **non** passa da qui, ed è voluto:
 * quella chiede «quanto capitale è uscito nel mese scelto», e il mese scelto può
 * essere futuro, mentre `projectStats` taglia il futuro come fa il saldo
 * (→ ADR-0064). Userebbe un insieme più corto e la riga sparirebbe in silenzio
 * proprio dove serve. → ADR-0079, ADR-0074
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

/**
 * Le righe «di cui» del saldo: dentro questo totale, quanto è la rata di un
 * progetto.
 *
 * Sta qui e non nelle pagine per la ragione di `useCoupleBalance()`: a
 * mostrarle sono **due** pagine — il Riepilogo e il Saldo — e devono dire la
 * stessa frase con lo stesso numero. Il mese è **oggi** e non quello scelto
 * nella striscia, perché il saldo è uno stato e non cambia col mese
 * (→ ADR-0058): legandolo al mese scelto, scorrendo la striscia il «di cui»
 * cambierebbe sotto un totale fermo. → ADR-0081
 *
 * I progetti arrivano da fuori invece di chiamare `useProjects()` qui dentro:
 * le due pagine che usano questo hook li hanno già, e un secondo `useMemo`
 * sulle stesse dipendenze è una seconda passata su tutte le spese a ogni
 * render. Attenzione a **quale** elenco si passa: la pagina Saldo ne tiene
 * anche uno filtrato sui progetti che pendono, e passare quello nasconderebbe
 * il «di cui» di un progetto in pari che questo mese ha comunque una rata.
 */
export function useBalanceBreakdown(
  owedToViewer: number,
  lookup: CategoryLookup,
  projects: readonly ProjectStats[],
): string[] {
  const { dataset, view } = useReadyStore()
  const today = todayIso()
  return useMemo(() => {
    const month = monthKeyOf(today)
    return projects
      .map((stats) => {
        const delta = recurringDeltaOf(dataset.expenses, stats.tricount, month, today)
        return diCuiLabel({
          delta: view.person === 'me' ? delta : -delta,
          balance: owedToViewer,
          label: lookup.label(stats.tricount.recurringCategory ?? ''),
          month: monthNameOf(month),
          format: (value) => formatEuro(value, { decimals: 0 }),
        })
      })
      .filter((line): line is string => line !== null)
  }, [dataset.expenses, lookup, owedToViewer, projects, today, view.person])
}
