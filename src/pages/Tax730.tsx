/**
 * Sezione 730, divisa per anno fiscale: la scena è «sono dal commercialista,
 * apro l'app, è tutto lì» — voci, note, scontrini e un riepilogo da consegnare.
 */

import { useMemo, useState, type ReactNode } from 'react'

import { BarList } from '../components/charts/BarList'
import { ExpenseList } from '../components/ExpenseList'
import { ExpenseSheet } from '../components/ExpenseSheet'
import { Card, Notice, StatTile, useToast } from '../components/ui'
import { copyText, downloadText } from '../data/download'
import { labelSlices } from '../domain/categories'
import { formatEuro } from '../domain/money'
import { tax730Csv, tax730Summary } from '../domain/export'
import {
  categoryBreakdown,
  tax730ByYear,
  tax730Suggestions,
  yearsOf,
  type Tax730Year,
} from '../domain/selectors'
import type { Expense } from '../domain/types'
import { usePageData } from './usePageData'

const EMPTY_YEAR = (year: number): Tax730Year => ({
  year,
  items: [],
  share: 0,
  total: 0,
  withReceipt: 0,
  missingReceipt: 0,
  withNotes: 0,
})

export function Tax730(): ReactNode {
  const { config, dataset, view, lookup, all } = usePageData()
  const person = view.person
  const toast = useToast()
  const [selected, setSelected] = useState<Expense | null>(null)

  const years = useMemo(() => tax730ByYear(dataset.expenses, person), [dataset.expenses, person])
  const availableYears = useMemo(() => {
    const withTags = years.map((y) => y.year)
    const fromData = yearsOf(all)
    return [...new Set([...withTags, ...fromData])].sort((a, b) => b - a)
  }, [all, years])

  const [year, setYear] = useState<number>(() => years[0]?.year ?? new Date().getFullYear())
  const current = years.find((y) => y.year === year) ?? EMPTY_YEAR(year)

  const suggestions = useMemo(
    () => tax730Suggestions(dataset.expenses, person, config.fiscal.deductibleHints, year).slice(0, 12),
    [config.fiscal.deductibleHints, dataset.expenses, person, year],
  )

  const byCategory = useMemo(
    () => labelSlices(categoryBreakdown(current.items, person), lookup),
    [current.items, lookup, person],
  )

  const personName = config.people[person].name

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1>🧾 Spese da 730</h1>
          <p className="page-sub">
            Quota di {personName} · anno fiscale {year}
          </p>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Anno fiscale">
        {availableYears.map((value) => {
          const count = years.find((y) => y.year === value)?.items.length ?? 0
          return (
            <button
              key={value}
              type="button"
              role="tab"
              className="tab"
              aria-selected={value === year}
              onClick={() => setYear(value)}
            >
              {value}
              {count > 0 ? ` · ${count}` : ''}
            </button>
          )
        })}
      </div>

      <div className="stack">
        <div className="kpi-row">
          <StatTile
            label="Quota da portare in detrazione"
            value={formatEuro(current.share)}
            hint={`su ${formatEuro(current.total)} di spesa complessiva`}
          />
          <StatTile label="Voci segnate" value={String(current.items.length)} />
          <StatTile
            label="Con scontrino"
            value={String(current.withReceipt)}
            hint={current.items.length > 0 ? `su ${current.items.length}` : undefined}
          />
          <StatTile label="Con nota" value={String(current.withNotes)} />
        </div>

        {current.missingReceipt > 0 ? (
          <Notice tone="warn">
            {current.missingReceipt}{' '}
            {current.missingReceipt === 1 ? 'voce non ha' : 'voci non hanno'} ancora il link allo
            scontrino. Carica la foto su Drive
            {config.fiscal.driveFolderHint ? ` (${config.fiscal.driveFolderHint})` : ''} e incollalo
            aprendo la spesa.
          </Notice>
        ) : null}

        <Card
          title={`Le spese del ${year}`}
          action={
            current.items.length > 0 ? (
              <div className="row" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    downloadText(
                      `730-${year}-${personName.toLowerCase()}.csv`,
                      tax730Csv(current, person, lookup, personName),
                      'text/csv;charset=utf-8',
                      true,
                    )
                    toast.show('CSV scaricato.')
                  }}
                >
                  Scarica CSV
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    void copyText(tax730Summary(current, person, lookup, personName)).then((ok) =>
                      toast.show(ok ? 'Riepilogo copiato.' : 'Non riesco a copiare: usa il CSV.'),
                    )
                  }}
                >
                  Copia riepilogo
                </button>
              </div>
            ) : null
          }
        >
          <ExpenseList
            expenses={current.items}
            person={person}
            lookup={lookup}
            onSelect={setSelected}
            emptyText={`Nessuna spesa segnata per il ${year}. Apri una spesa e usa «Segna per il 730».`}
          />
        </Card>

        {byCategory.length > 0 ? (
          <Card title="Per categoria" note="Come si compone la detrazione">
            <BarList items={byCategory} />
          </Card>
        ) : null}

        {suggestions.length > 0 ? (
          <Card
            title="Da controllare"
            note="Spese in categorie tipicamente detraibili che non hai ancora segnato"
          >
            <ExpenseList
              expenses={suggestions}
              person={person}
              lookup={lookup}
              onSelect={setSelected}
            />
            <div className="card-foot">
              È solo un promemoria: quali spese siano davvero detraibili lo dice il commercialista.
            </div>
          </Card>
        ) : null}
      </div>

      {selected ? (
        <ExpenseSheet expense={selected} lookup={lookup} onClose={() => setSelected(null)} />
      ) : null}
    </>
  )
}
