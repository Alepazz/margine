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
import { SOURCES, type Expense, type PersonId, type Source } from '../domain/types'
import { usePageData } from './usePageData'

const PAGE_SIZE = 80

const SORT_LABELS: Record<SortKey, string> = {
  'date-desc': 'Più recenti',
  'date-asc': 'Più vecchie',
  'amount-desc': 'Importo maggiore',
  'amount-asc': 'Importo minore',
}

export function Spese(): ReactNode {
  const { config, view, lookup, all } = usePageData()
  const person = view.person
  const [filter, setFilter] = useState<ExpenseFilter>(EMPTY_FILTER)
  const [sort, setSort] = useState<SortKey>('date-desc')
  const [selected, setSelected] = useState<Expense | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const activeFilters =
    (filter.month === 'all' ? 0 : 1) +
    (filter.category === 'all' ? 0 : 1) +
    (filter.source === 'all' ? 0 : 1) +
    (filter.paidBy === 'all' ? 0 : 1) +
    (filter.tax730Only ? 1 : 0)

  const months = useMemo(() => monthsOf(all).reverse(), [all])
  const filtered = useMemo(() => sortExpenses(applyFilter(all, filter), sort, person), [all, filter, person, sort])

  /* L'impaginazione la fa `ExpenseList`, che riparte da sola quando l'insieme cambia. */
  const update = (patch: Partial<ExpenseFilter>) => {
    setFilter((current) => ({ ...current, ...patch }))
  }

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
            onChange={(event) => update({ month: event.target.value === 'all' ? 'all' : event.target.value })}
            aria-label="Mese"
          >
            <option value="all">Tutti i mesi</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
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
            value={filter.source}
            onChange={(event) => update({ source: event.target.value as Source | 'all' })}
            aria-label="Origine"
          >
            <option value="all">Tutti i tricount</option>
            {SOURCES.map((source) => (
              <option key={source} value={source}>
                {lookup.sourceTitle(source)}
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
