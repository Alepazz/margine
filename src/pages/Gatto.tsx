/** Quanto costa il gatto: la domanda che nessun tricount risponde da solo. */

import { useMemo, useState, type ReactNode } from 'react'

import { BarList } from '../components/charts/BarList'
import { CategoryDonut, type DonutSlice } from '../components/charts/CategoryDonut'
import { TrendChart } from '../components/charts/TrendChart'
import { ExpenseList } from '../components/ExpenseList'
import { ExpenseSheet } from '../components/ExpenseSheet'
import { Card, Notice, StatTile } from '../components/ui'
import { formatDate } from '../domain/dates'
import { formatEuro } from '../domain/money'
import { averageMonthly, catStats, fillMonthGaps } from '../domain/selectors'
import type { Expense } from '../domain/types'
import { usePageData } from './usePageData'

export function Gatto(): ReactNode {
  const { config, view, lookup, chart, month, today, everyday } = usePageData()
  const person = view.person
  const [selected, setSelected] = useState<Expense | null>(null)

  const catCategory = config.catCategory
  const stats = useMemo(
    /* `everyday` e non tutte: come per la pagina Casa, un progetto porterebbe
       via da solo la media al mese di una raccolta. → ADR-0074 */
    () => catStats(everyday, person, catCategory),
    [catCategory, everyday, person],
  )

  const slices = useMemo<DonutSlice[]>(
    () =>
      stats.subcategories.map((slice, index) => ({
        key: slice.key,
        label: lookup.subLabel(catCategory, slice.key === 'altro' ? undefined : slice.key),
        value: slice.total,
        pct: slice.pct,
        /* Poche voci, una sola famiglia: una rampa a un colore invece di tinte diverse. */
        color: chart.seq[Math.max(0, chart.seq.length - 2 - index * 2)] ?? chart.seq[3] ?? '#3987e5',
      })),
    [catCategory, chart.seq, lookup, stats.subcategories],
  )

  const trend = useMemo(
    () => fillMonthGaps(stats.series).map((row) => ({ month: row.month, value: row.total })),
    [stats.series],
  )
  const average = useMemo(() => averageMonthly(stats.series), [stats.series])

  const category = config.categories.find((c) => c.id === catCategory)

  if (stats.count === 0) {
    return (
      <>
        <div className="page-head">
          <div className="page-head-text">
            <h1>{category?.emoji ?? '🐈'} Il gatto</h1>
          </div>
        </div>
        <Notice>
          Non ci sono ancora spese nella categoria «{category?.label ?? catCategory}». Compaiono qui
          appena il prossimo import ne trova una.
        </Notice>
      </>
    )
  }

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1>{category?.emoji ?? '🐈'} Il gatto</h1>
          <p className="page-sub">
            {stats.count} spese
            {stats.firstDate ? ` dal ${formatDate(stats.firstDate)}` : ''} · quota di{' '}
            {config.people[person].name}
          </p>
        </div>
      </div>

      <div className="stack">
        <div className="kpi-row">
          <StatTile
            label="La tua quota, in tutto"
            value={formatEuro(stats.share, { decimals: 0 })}
            hint={`su ${formatEuro(stats.total, { decimals: 0 })} spesi in due`}
          />
          <StatTile
            label="Media al mese"
            value={formatEuro(stats.monthlyAvgShare)}
            hint={`${formatEuro(stats.monthlyAvgTotal)} contando entrambi`}
          />
          <StatTile label="Spese registrate" value={String(stats.count)} hint={`su ${stats.months} mesi`} />
          <StatTile
            label="Ultima spesa"
            value={stats.lastDate ? formatDate(stats.lastDate) : '—'}
            hint={category?.label}
            smallValue
          />
        </div>

        <div className="grid-2">
          <Card title="Per cosa" note="Sottocategorie, quota tua">
            <CategoryDonut slices={slices} total={stats.share} centerCaption="quota tua" />
          </Card>

          <Card title="Come si divide tra voi due" note="Quote sostenute, su tutta la storia">
            <BarList
              items={[
                {
                  key: 'me',
                  label: config.people.me.name,
                  value: stats.perPerson.me,
                  color: chart.seq[5] ?? '#256abf',
                },
                {
                  key: 'partner',
                  label: config.people.partner.name,
                  value: stats.perPerson.partner,
                  color: chart.seq[3] ?? '#3987e5',
                },
              ]}
            />
            <div className="card-foot">
              Sono quote, non pagamenti: chi anticipa la spesa non è per forza chi la sostiene.
            </div>
          </Card>
        </div>

        <Card title="Andamento" note="Quanto costa il gatto, mese per mese">
          <TrendChart points={trend} average={average.perMonth} highlightMonth={month} />
        </Card>

        <Card title="Tutte le spese del gatto">
          <ExpenseList
            today={today}
            expenses={stats.expenses}
            person={person}
            lookup={lookup}
            onSelect={setSelected}
            showSource={false}
            detail="subcategory"
            pageSize={12}
          />
        </Card>
      </div>

      {selected ? (
        <ExpenseSheet expense={selected} lookup={lookup} onClose={() => setSelected(null)} />
      ) : null}
    </>
  )
}
