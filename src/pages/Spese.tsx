/**
 * Dettaglio di tutte le spese: ricerca libera, filtri, ordinamento.
 *
 * Qui le vacanze ci sono sempre — è la pagina in cui si va a cercare una voce
 * precisa, non quella delle medie — e il filtro «origine» le isola quando serve.
 */

import { useMemo, useState, type ReactNode } from 'react'

import { ExpenseList } from '../components/ExpenseList'
import { ExpenseSheet } from '../components/ExpenseSheet'
import { Card, StatTile } from '../components/ui'
import { monthLabel } from '../domain/dates'
import { formatEuro, toCents } from '../domain/money'
import {
  EMPTY_FILTER,
  applyFilter,
  monthsOf,
  sortExpenses,
  totalAmount,
  totalCouple,
  totalOthers,
  totalShare,
  type ExpenseFilter,
  type SortKey,
} from '../domain/selectors'
import { isMember, tricountTitleOf, type Expense, type PersonId } from '../domain/types'
import { usePageData } from './usePageData'

const PAGE_SIZE = 80

const SORT_LABELS: Record<SortKey, string> = {
  'date-desc': 'Più recenti',
  'date-asc': 'Più vecchie',
  'amount-desc': 'Importo maggiore',
  'amount-asc': 'Importo minore',
}

export function Spese(): ReactNode {
  const { config, dataset, view, lookup, all, today } = usePageData()
  const person = view.person
  const [filter, setFilter] = useState<ExpenseFilter>(EMPTY_FILTER)
  const [sort, setSort] = useState<SortKey>('date-desc')
  const [selected, setSelected] = useState<Expense | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  /*
   * Mese e intervallo sono **un** filtro, quello sul tempo: contarli separati
   * direbbe «(2)» per una condizione sola. Non sono mai attivi insieme — ci
   * pensano `pickMonth` e `pickRange` — ma il conteggio non ci fa affidamento.
   */
  const timeFiltered = filter.month !== 'all' || filter.from !== '' || filter.to !== ''
  const activeFilters =
    (timeFiltered ? 1 : 0) +
    (filter.category === 'all' ? 0 : 1) +
    (filter.tricount === 'all' ? 0 : 1) +
    (filter.paidBy === 'all' ? 0 : 1) +
    (filter.tax730Only ? 1 : 0)

  const months = useMemo(() => monthsOf(all).reverse(), [all])
  const filtered = useMemo(() => sortExpenses(applyFilter(all, filter), sort, person), [all, filter, person, sort])

  /*
   * Il calendario vale solo dove l'ordinamento è il tempo. Ordinando per
   * importo i giorni tornerebbero sparsi — «31 agosto» tre volte in mezzo alla
   * pagina — e un'intestazione che si ripete non separa niente: sarebbe un
   * calendario mescolato. Lo decide questa pagina, che è l'unica a sapere come
   * ha ordinato. → ADR-0077
   */
  const byDay = sort === 'date-desc' || sort === 'date-asc'

  /* L'impaginazione la fa `ExpenseList`, che riparte da sola quando l'insieme cambia. */
  const update = (patch: Partial<ExpenseFilter>) => {
    setFilter((current) => ({ ...current, ...patch }))
  }

  /*
   * Il tempo si filtra in due modi che si escludono: la tendina per un mese
   * intero — un tocco, ed è il caso di gran lunga più frequente — e i due
   * estremi per tutto il resto. Tenerli combinabili in AND darebbe insiemi
   * vuoti inspiegabili («Agosto» + «dal 3 al 12 marzo»), e non c'è domanda che
   * quella coppia risponda. → ADR-0050
   */
  const pickMonth = (month: ExpenseFilter['month']) => update({ month, from: '', to: '' })
  const pickRange = (key: 'from' | 'to', value: string) => update({ [key]: value, month: 'all' })

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1>Tutte le spese</h1>
          <p className="page-sub">
            Ogni voce di tutti i tricount, come quota di {config.people[person].name}
          </p>
        </div>
      </div>

      <Card>
        <div className="filters">
          <input
            className="input input-search"
            type="search"
            placeholder="Cerca fra le spese…"
            value={filter.query}
            onChange={(event) => update({ query: event.target.value })}
            aria-label="Cerca"
          />
          {/* Su telefono i menù stanno chiusi: cinque righe di filtri prima delle
              spese sono cinque righe di troppo. */}
          <button
            type="button"
            className="btn btn-sm filters-toggle"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            {filtersOpen ? 'Nascondi filtri' : 'Filtri'}
            {activeFilters > 0 ? ` (${activeFilters})` : ''}
          </button>
        </div>

        <div className={`filters filters-more${filtersOpen ? ' is-open' : ''}`}>
          <select
            className="select"
            value={filter.month}
            onChange={(event) => pickMonth(event.target.value)}
            aria-label="Mese"
          >
            <option value="all">Tutti i mesi</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          {/*
            `min`/`max` incrociati spengono i giorni impossibili **nel
            selettore**, che sul telefono è l'unico modo in cui una data si
            mette. Non sono un vincolo sul valore: digitata a mano, una data
            fuori intervallo entra lo stesso (il campo resta `:invalid` e
            `validity.rangeOverflow` è vero) e l'elenco esce vuoto — verificato,
            non dedotto. Va bene così: con i due estremi rovesciati uno accanto
            all'altro, «nessuna spesa» si spiega da sé.

            Il perché del contenitore sta in `.filter-range`, che è dove agisce.
          */}
          <div className="filter-range">
            <label className="filter-date">
              <span className="label">Dal</span>
              <input
                className="input"
                type="date"
                value={filter.from}
                max={filter.to === '' ? undefined : filter.to}
                onChange={(event) => pickRange('from', event.target.value)}
                aria-label="Dal giorno"
              />
            </label>
            <label className="filter-date">
              <span className="label">Al</span>
              <input
                className="input"
                type="date"
                value={filter.to}
                min={filter.from === '' ? undefined : filter.from}
                onChange={(event) => pickRange('to', event.target.value)}
                aria-label="Al giorno"
              />
            </label>
          </div>
          <select
            className="select"
            value={filter.category}
            onChange={(event) => update({ category: event.target.value })}
            aria-label="Categoria"
          >
            <option value="all">Tutte le categorie</option>
            {config.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.emoji ? `${category.emoji} ` : ''}
                {category.label}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={filter.tricount}
            onChange={(event) => update({ tricount: event.target.value })}
            aria-label="Tricount"
          >
            <option value="all">Tutti i tricount</option>
            {/* Solo i propri: le spese in elenco sono già solo quelle con una
                quota di chi guarda, e il compartimento dell'altra persona qui
                sarebbe un filtro che non trova mai niente. → ADR-0037 */}
            {dataset.tricounts
              .filter((tricount) => isMember(tricount, person))
              .map((tricount) => (
                <option key={tricount.id} value={tricount.id}>
                  {tricountTitleOf(tricount)}
                </option>
              ))}
          </select>
          <select
            className="select"
            value={filter.paidBy}
            onChange={(event) => update({ paidBy: event.target.value as PersonId | 'all' })}
            aria-label="Chi ha pagato"
          >
            <option value="all">Pagata da chiunque</option>
            <option value="me">Pagata da {config.people.me.name}</option>
            <option value="partner">Pagata da {config.people.partner.name}</option>
          </select>
          <select
            className="select"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            aria-label="Ordinamento"
          >
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={filter.tax730Only}
              onChange={(event) => update({ tax730Only: event.target.checked })}
            />
            Solo 730
          </label>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setFilter(EMPTY_FILTER)
              setSort('date-desc')
            }}
          >
            Azzera filtri
          </button>
        </div>

        <div className="kpi-row" style={{ marginBottom: 14 }}>
          <StatTile label="Voci trovate" value={String(filtered.length)} />
          <StatTile
            label={`Quota ${config.people[person].name}`}
            value={formatEuro(totalShare(filtered, person), { decimals: 0 })}
          />
          <StatTile
            label="Spesa in due"
            value={formatEuro(totalCouple(filtered), { decimals: 0 })}
            hint={
              /* In vacanza con altri il conto è più grande di quello che avete pagato. */
              toCents(totalOthers(filtered)) > 0
                ? `${formatEuro(totalAmount(filtered), { decimals: 0 })} il conto intero, con le quote di altri`
                : undefined
            }
          />
        </div>

        <ExpenseList
          today={today}
          byDay={byDay}
          expenses={filtered}
          person={person}
          lookup={lookup}
          onSelect={setSelected}
          emptyText="Nessuna spesa corrisponde ai filtri."
          pageSize={PAGE_SIZE}
        />
      </Card>

      {selected ? (
        <ExpenseSheet expense={selected} lookup={lookup} onClose={() => setSelected(null)} />
      ) : null}
    </>
  )
}
