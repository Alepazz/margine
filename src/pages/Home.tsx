/**
 * Riepilogo: la risposta a «quanto margine ho questo mese», e subito sotto il
 * perché — dove sono finiti i soldi e se è tanto o poco rispetto al solito.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { BarList } from '../components/charts/BarList'
import { CategoryDonut, type DonutSlice } from '../components/charts/CategoryDonut'
import { Sparkline } from '../components/charts/Sparkline'
import { StackedMonths, type StackRow, type StackSeries } from '../components/charts/StackedMonths'
import { TrendChart } from '../components/charts/TrendChart'
import { MonthPicker, PersonSwitch, VacationToggle } from '../components/Controls'
import { ExpenseList } from '../components/ExpenseList'
import { ExpenseSheet } from '../components/ExpenseSheet'
import { MarginMeter } from '../components/MarginMeter'
import { Card, DeltaLabel, Notice, StatTile } from '../components/ui'
import {
  MAX_STACK_SERIES,
  REST_KEY,
  foldSlices,
  labelSlices,
  stackSeriesKeys,
} from '../domain/categories'
import { currentMonthKey, monthLabel, monthLabelShort } from '../domain/dates'
import { EMPTY_INCOME, computeMargin } from '../domain/income'
import { formatEuro, relativeChange, toCents } from '../domain/money'
import {
  averageByCategory,
  averageMonthly,
  categoryBreakdown,
  compareToAverage,
  comparePeriods,
  compareYearOverYear,
  expensesOfMonth,
  fillMonthGaps,
  groupByMonth,
  findMonth,
  projectMonth,
  shareOf,
  topExpenses,
} from '../domain/selectors'
import type { Expense } from '../domain/types'
import { usePageData } from './usePageData'

const TREND_MONTHS = 18
const STACK_MONTHS = 12

export function Home(): ReactNode {
  const { chart, config, view, month, setMonth, lookup, visible, series, today } = usePageData()
  const [selected, setSelected] = useState<Expense | null>(null)
  const person = view.person

  /* Il mese in corso è parziale: escluderlo dalla media evita di confrontarlo con se stesso. */
  const partialMonth = currentMonthKey()

  const monthExpenses = useMemo(() => expensesOfMonth(visible, month), [visible, month])
  const monthTotal = useMemo(() => findMonth(series, month), [series, month])
  const average = useMemo(() => averageMonthly(series, { excludeMonth: partialMonth }), [series, partialMonth])
  const projection = useMemo(
    () => projectMonth(monthTotal, today, average.fixedPerMonth),
    [average.fixedPerMonth, monthTotal, today],
  )

  const profile = person === 'me' ? config.income.me : (config.income.partner ?? EMPTY_INCOME)
  const margin = useMemo(() => computeMargin(monthTotal, projection, profile), [monthTotal, profile, projection])

  const slices = useMemo<DonutSlice[]>(
    () => labelSlices(foldSlices(categoryBreakdown(monthExpenses, person), lookup), lookup),
    [lookup, monthExpenses, person],
  )

  const versusAverage = useMemo(() => {
    const averages = averageByCategory(visible, person, { excludeMonth: partialMonth })
    const current = categoryBreakdown(monthExpenses, person)
    return compareToAverage(current, averages)
      .filter((row) => toCents(row.current) !== 0 || toCents(row.average) !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 6)
  }, [monthExpenses, partialMonth, person, visible])

  const filled = useMemo(() => fillMonthGaps(series), [series])
  const trendPoints = useMemo(
    () => filled.slice(-TREND_MONTHS).map((row) => ({ month: row.month, value: row.total })),
    [filled],
  )
  const sparkValues = useMemo(() => filled.slice(-12).map((row) => row.total), [filled])

  const stack = useMemo(() => {
    const keys = stackSeriesKeys(categoryBreakdown(visible, person), lookup, MAX_STACK_SERIES)
    const months = filled.slice(-STACK_MONTHS).map((row) => row.month)
    /* Un raggruppamento solo, invece di dodici passate sull'intero elenco. */
    const byMonth = groupByMonth(visible)
    const rows: StackRow[] = months.map((m) => {
      const cents = new Map<string, number>(keys.map((key) => [key, 0]))
      for (const expense of byMonth.get(m) ?? []) {
        const key = cents.has(expense.category) ? expense.category : REST_KEY
        if (!cents.has(key)) continue
        cents.set(key, (cents.get(key) ?? 0) + toCents(shareOf(expense, person)))
      }
      const row: StackRow = { month: m }
      for (const key of keys) row[key] = (cents.get(key) ?? 0) / 100
      return row
    })
    const series3: StackSeries[] = keys.map((key) => ({
      key,
      label: lookup.label(key),
      color: lookup.color(key),
    }))
    return { rows, series: series3 }
  }, [filled, lookup, person, visible])

  const quarter = useMemo(() => comparePeriods(series, month, 3), [month, series])
  const yoy = useMemo(() => compareYearOverYear(series, month), [month, series])
  const top = useMemo(() => topExpenses(monthExpenses, person, 5), [monthExpenses, person])

  /*
   * A metà mese si è per definizione sotto la media: confrontare il parziale
   * con un mese intero direbbe «vai benissimo» il 5 di ogni mese. Per il mese in
   * corso si confronta quindi la proiezione, e l'etichetta lo dice.
   */
  const inProgress = projection.method === 'stimato'
  const comparedTotal = inProgress ? projection.projected : monthTotal.total
  const comparedVariable = inProgress ? projection.projectedVariable : monthTotal.variable
  const compareSuffix = inProgress ? 'sulla media (proiezione)' : 'sulla media'
  const monthChange = relativeChange(comparedTotal, average.perMonth)

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1>{monthLabel(month)}</h1>
          <p className="page-sub">
            {config.people[person].name} · {monthTotal.count}{' '}
            {monthTotal.count === 1 ? 'spesa' : 'spese'}
            {view.includeVacations ? ' · vacanze incluse' : ''}
          </p>
        </div>
        <div className="row" style={{ marginLeft: 'auto' }}>
          <MonthPicker />
        </div>
      </div>

      <div className="row" style={{ marginBottom: 16, gap: 8 }}>
        <PersonSwitch />
        <VacationToggle />
      </div>

      <div className="stack">
        {!margin.known ? (
          <Notice tone="warn">
            Il profilo entrate non è ancora compilato, quindi il margine non si può calcolare.{' '}
            <Link to="/impostazioni">Vedi come impostarlo</Link>.
          </Notice>
        ) : null}

        <Card>
          <MarginMeter result={margin} projection={projection} />
        </Card>

        <div className="kpi-row">
          <StatTile
            label={inProgress ? 'Speso finora' : 'Speso nel mese'}
            value={formatEuro(monthTotal.total, { decimals: 0 })}
            hint={`media ${formatEuro(average.perMonth, { decimals: 0 })} su ${average.months} mesi`}
            delta={<DeltaLabel change={monthChange} suffix={compareSuffix} />}
            aside={<Sparkline values={sparkValues} />}
          />
          <StatTile
            label="Spese fisse"
            value={formatEuro(monthTotal.fixed, { decimals: 0 })}
            hint="affitto, bollette, abbonamenti"
          />
          <StatTile
            label="Spese variabili"
            value={formatEuro(monthTotal.variable, { decimals: 0 })}
            hint="la parte su cui puoi incidere"
            delta={
              <DeltaLabel
                change={relativeChange(comparedVariable, average.variablePerMonth)}
                suffix={compareSuffix}
              />
            }
          />
          <StatTile
            label="Proiezione fine mese"
            value={formatEuro(projection.projected, { decimals: 0 })}
            hint={
              projection.method === 'chiuso'
                ? 'mese chiuso'
                : `su ${projection.elapsedDays} giorni di ${projection.totalDays}`
            }
          />
        </div>

        <div className="grid-2">
          <Card title="Dove sono finiti i soldi" note={`Categorie di ${monthLabel(month)}`}>
            <CategoryDonut slices={slices} total={monthTotal.total} centerCaption="quota tua" />
          </Card>

          <Card title="Sopra o sotto la tua media" note="Scostamento per categoria, questo mese">
            {versusAverage.length === 0 ? (
              <p className="empty">Serve un po' di storia per confrontare.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Categoria</th>
                      <th className="cell-num">Questo mese</th>
                      <th className="cell-num">Media</th>
                      <th className="cell-num">Scostamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versusAverage.map((row) => (
                      <tr key={row.key}>
                        <td>
                          <span className="row" style={{ gap: 6 }}>
                            <span
                              className="chip-dot"
                              style={{ background: lookup.color(row.key) }}
                              aria-hidden="true"
                            />
                            {lookup.label(row.key)}
                          </span>
                        </td>
                        <td className="cell-num">{formatEuro(row.current, { decimals: 0 })}</td>
                        <td className="cell-num">{formatEuro(row.average, { decimals: 0 })}</td>
                        <td className="cell-num">
                          <span className={`delta ${row.delta > 0 ? 'is-bad' : row.delta < 0 ? 'is-good' : 'is-neutral'}`}>
                            {row.delta > 0 ? '+' : ''}
                            {formatEuro(row.delta, { decimals: 0 })}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <Card
          title="Andamento mensile"
          note={`Quota di ${config.people[person].name}, ultimi ${Math.min(TREND_MONTHS, trendPoints.length)} mesi · tocca un mese per aprirlo`}
        >
          <TrendChart
            points={trendPoints}
            average={average.perMonth}
            highlightMonth={month}
            onSelectMonth={setMonth}
          />
        </Card>

        <Card title="Composizione della spesa" note={`Categorie mese per mese, ultimi ${STACK_MONTHS} mesi`}>
          <StackedMonths rows={stack.rows} series={stack.series} />
        </Card>

        <div className="grid-2">
          <Card title="Confronti">
            <div className="kpi-row">
              <StatTile
                label="Ultimi 3 mesi"
                value={formatEuro(quarter.current, { decimals: 0 })}
                hint={`3 precedenti: ${formatEuro(quarter.previous, { decimals: 0 })}`}
                delta={<DeltaLabel change={quarter.deltaPct} />}
              />
              <StatTile
                label={`${monthLabelShort(month)} contro ${monthLabelShort(yoy.lastYearMonth)}`}
                value={formatEuro(yoy.current, { decimals: 0 })}
                hint={`anno scorso: ${formatEuro(yoy.lastYear, { decimals: 0 })}`}
                delta={<DeltaLabel change={yoy.deltaPct} />}
              />
            </div>
            <div className="card-foot">
              Il confronto sui tre mesi parte dal mese precedente a quello selezionato: il mese in
              corso è parziale e falserebbe il paragone.
            </div>
          </Card>

          <Card title="Le voci più pesanti del mese">
            <ExpenseList
              expenses={top}
              person={person}
              lookup={lookup}
              onSelect={setSelected}
              emptyText="Nessuna spesa in questo mese."
            />
            <div className="card-foot">
              <Link to="/spese">Vedi tutte le spese →</Link>
            </div>
          </Card>
        </div>

        <Card title="Fisse contro variabili" note="Quanto del mese è incomprimibile">
          {/* Una sola famiglia di dati, due tonalità dello stesso blu: non sono categorie diverse. */}
          <BarList
            items={[
              {
                key: 'fisse',
                label: 'Fisse',
                value: monthTotal.fixed,
                color: chart.seq[5] ?? '#256abf',
                sub:
                  average.fixedPerMonth > 0
                    ? `media ${formatEuro(average.fixedPerMonth, { decimals: 0 })}`
                    : undefined,
              },
              {
                key: 'variabili',
                label: 'Variabili',
                value: monthTotal.variable,
                color: chart.seq[3] ?? '#3987e5',
                sub:
                  average.variablePerMonth > 0
                    ? `media ${formatEuro(average.variablePerMonth, { decimals: 0 })}`
                    : undefined,
              },
            ]}
            max={Math.max(monthTotal.fixed, monthTotal.variable)}
          />
        </Card>
      </div>

      {selected ? (
        <ExpenseSheet expense={selected} lookup={lookup} onClose={() => setSelected(null)} />
      ) : null}
    </>
  )
}
