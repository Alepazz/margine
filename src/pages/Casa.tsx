/**
 * Quanto costa la casa.
 *
 * Due sezioni, e non è pignoleria: il tricount «Spese Casa» e la categoria
 * «casa» **non sono lo stesso insieme**. Nel tricount ci sono anche la
 * telefonia e l'assicurazione dell'auto; e spese di casa vere — prodotti,
 * arredo, qualche manutenzione — sono finite nell'altro tricount condiviso.
 * Mostrarne uno solo lascerebbe fuori pezzi di casa; fonderli direbbe che la
 * telefonia è casa. Quindi si mostrano entrambi, ognuno col suo nome, e dentro
 * il tricount le voci compaiono sotto la loro categoria vera.
 */

import { useMemo, useState, type ReactNode } from 'react'

import { BarList } from '../components/charts/BarList'
import { CategoryDonut, type DonutSlice } from '../components/charts/CategoryDonut'
import { TrendChart } from '../components/charts/TrendChart'
import { ExpenseList } from '../components/ExpenseList'
import { ExpenseSheet } from '../components/ExpenseSheet'
import { Card, Notice, StatTile } from '../components/ui'
import { donutSlices } from '../domain/categories'
import { formatDate } from '../domain/dates'
import { formatEuro } from '../domain/money'
import {
  averageMonthly,
  fillMonthGaps,
  houseLedger,
  houseOutside,
  subcategoryBreakdown,
  subsetStats,
} from '../domain/selectors'
import type { Expense } from '../domain/types'
import { usePageData } from './usePageData'

/* Una schermata di righe alla volta: il tricount di casa da solo ne ha novanta. */
const LIST_PAGE = 12

export function Casa(): ReactNode {
  const { config, dataset, view, lookup, chart, month } = usePageData()
  const person = view.person
  const [selected, setSelected] = useState<Expense | null>(null)

  const { houseTricount, houseCategory } = config
  const expenses = dataset.expenses

  const ledger = useMemo(() => houseLedger(expenses, houseTricount), [expenses, houseTricount])
  const outside = useMemo(
    () => houseOutside(expenses, houseTricount, houseCategory),
    [expenses, houseCategory, houseTricount],
  )

  const stats = useMemo(() => subsetStats(ledger, person), [ledger, person])
  const outsideStats = useMemo(() => subsetStats(outside, person), [outside, person])

  /* Il tricount mescola categorie, quindi la ciambella è per categoria: i colori
     sono quelli fissi di ogni categoria, e la telefonia si vede per quello che è. */
  const ledgerSlices = useMemo<DonutSlice[]>(
    () => donutSlices(ledger, person, lookup),
    [ledger, lookup, person],
  )

  /* Fuori dal tricount sono tutte della stessa categoria: qui distingue la
     sottocategoria, e una rampa a un colore dice che è una famiglia sola. */
  const outsideSlices = useMemo<DonutSlice[]>(
    () =>
      subcategoryBreakdown(outside, person, houseCategory).map((slice, index) => ({
        key: slice.key,
        label: lookup.subLabel(houseCategory, slice.key === 'altro' ? undefined : slice.key),
        value: slice.total,
        pct: slice.pct,
        color: chart.seq[Math.max(0, chart.seq.length - 2 - index * 2)] ?? chart.seq[3] ?? '#3987e5',
      })),
    [chart.seq, houseCategory, lookup, outside, person],
  )

  const trend = useMemo(
    () => fillMonthGaps(stats.series).map((row) => ({ month: row.month, value: row.total })),
    [stats.series],
  )
  const average = useMemo(() => averageMonthly(stats.series), [stats.series])

  const ledgerLabel = lookup.tricountLabel(houseTricount)
  const houseCategoryLabel = lookup.label(houseCategory)

  if (stats.count === 0 && outsideStats.count === 0) {
    return (
      <>
        <div className="page-head">
          <div className="page-head-text">
            <h1>🏠 Casa</h1>
          </div>
        </div>
        <Notice>
          Non ci sono ancora spese né nel tricount «{ledgerLabel}» né nella categoria «
          {houseCategoryLabel}». Compaiono qui appena il prossimo import ne trova una.
        </Notice>
      </>
    )
  }

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1>🏠 Casa</h1>
          <p className="page-sub">
            {stats.count} voci nel tricount
            {outsideStats.count > 0 ? ` · ${outsideStats.count} fuori` : ''}
            {stats.firstDate ? ` · dal ${formatDate(stats.firstDate)}` : ''} · quota di{' '}
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
            value={formatEuro(stats.monthlyAvgShare, { decimals: 0 })}
            hint={`${formatEuro(stats.monthlyAvgTotal, { decimals: 0 })} contando entrambi`}
          />
          <StatTile
            label="Voci nel tricount"
            value={String(stats.count)}
            hint={`su ${stats.months} mesi`}
          />
          <StatTile
            label="Ultima spesa"
            value={stats.lastDate ? formatDate(stats.lastDate) : '—'}
            hint={ledgerLabel}
            smallValue
          />
        </div>

        <div className="grid-2">
          <Card title="Per cosa" note={`Categorie dentro «${ledgerLabel}», quota tua`}>
            <CategoryDonut slices={ledgerSlices} total={stats.share} centerCaption="quota tua" />
            <div className="card-foot">
              Non è tutto casa: in questo tricount vivono anche la telefonia e l'assicurazione
              dell'auto. Compaiono sotto la loro categoria invece di essere travestite.
            </div>
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

        <Card title="Andamento" note="Quanto costa la casa, mese per mese">
          <TrendChart points={trend} average={average.perMonth} highlightMonth={month} />
        </Card>

        <Card title={`Le spese di «${ledgerLabel}»`} note={`${stats.count} voci`}>
          <ExpenseList
            expenses={stats.expenses}
            person={person}
            lookup={lookup}
            onSelect={setSelected}
            showSource={false}
            pageSize={LIST_PAGE}
          />
        </Card>

        {outsideStats.count > 0 ? (
          <Card
            title="Spese di casa fuori dal tricount"
            note={`Categoria «${houseCategoryLabel}» registrata in un altro tricount · ${outsideStats.count} voci`}
          >
            <div className="kpi-row" style={{ marginBottom: 14 }}>
              <StatTile
                label="La tua quota"
                value={formatEuro(outsideStats.share, { decimals: 0 })}
                hint={`su ${formatEuro(outsideStats.total, { decimals: 0 })} in due`}
              />
              <StatTile
                label="Media al mese"
                value={formatEuro(outsideStats.monthlyAvgShare, { decimals: 0 })}
              />
            </div>
            <div className="grid-2">
              <CategoryDonut
                slices={outsideSlices}
                total={outsideStats.share}
                centerCaption="quota tua"
              />
              <ExpenseList
                expenses={outsideStats.expenses}
                person={person}
                lookup={lookup}
                onSelect={setSelected}
                detail="subcategory"
                pageSize={LIST_PAGE}
              />
            </div>
            <div className="card-foot">
              Sono spese di casa a tutti gli effetti, ma non passano dal tricount delle fisse:
              stanno qui perché il totale di «casa» non torni per difetto.
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
