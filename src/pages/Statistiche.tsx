/**
 * Statistiche: tutto quello che non guarda il mese scelto.
 *
 * È la pagina che risponde a domande sulla storia — com'è andata negli anni,
 * quanto costa il mese base, quando è stato il mese più caro — e non ha un
 * selettore del mese perché non le servirebbe a niente. Le due schede che
 * stavano nel Riepilogo (l'andamento e la composizione) sono qui per la stessa
 * ragione: là si sceglieva un mese e loro non cambiavano. → ADR-0034
 *
 * L'interruttore delle vacanze invece c'è, e conta: una settimana di viaggio
 * sposta la media di un mese, e il confronto fra anni ancora di più.
 * → ADR-0010
 */

import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { CategoryDonut, type DonutSlice } from '../components/charts/CategoryDonut'
import { Sparkline } from '../components/charts/Sparkline'
import { StackedMonths, type StackRow, type StackSeries } from '../components/charts/StackedMonths'
import { TrendChart } from '../components/charts/TrendChart'
import { VacationToggle } from '../components/Controls'
import { ExpenseList } from '../components/ExpenseList'
import { ExpenseSheet } from '../components/ExpenseSheet'
import { Card, StatTile } from '../components/ui'
import { MAX_STACK_SERIES, REST_KEY, donutSlices, stackSeriesKeys } from '../domain/categories'
import { currentMonthKey, monthLabel, monthLabelShort } from '../domain/dates'
import { formatEuro, formatPct, sumBy, toCents } from '../domain/money'
import {
  averageByCategory,
  averageMonthly,
  categoryBreakdown,
  extremeMonths,
  fillMonthGaps,
  fixedShareSeries,
  groupByMonth,
  recurringProfile,
  shareOf,
  topExpenses,
  yearlyTotals,
} from '../domain/selectors'
import type { Expense } from '../domain/types'
import { usePageData } from './usePageData'

const STACK_MONTHS = 12
const TOP_EXPENSES = 10

export function Statistiche(): ReactNode {
  const { config, view, lookup, visible, series } = usePageData()
  const person = view.person
  const [selected, setSelected] = useState<Expense | null>(null)

  /* Il mese in corso è parziale: fuori dalle medie e fuori dai record. */
  const partialMonth = currentMonthKey()

  const filled = useMemo(() => fillMonthGaps(series), [series])
  /*
    * Le stesse opzioni del Riepilogo, e non è una ripetizione da togliere: se
    * le due pagine divergono mostrano **numeri diversi per la stessa media**.
    * Misurato sui dati veri con un mese fantasma in mezzo — 1411,58 € su 22
    * mesi di qua, 1350,32 € su 23 di là. → ADR-0055
    */
  const average = useMemo(
    () => averageMonthly(series, { excludeMonth: partialMonth, until: partialMonth }),
    [partialMonth, series],
  )
  /* Il denaro si somma solo con `money.ts`: un reduce a mano qui reintrodurrebbe
     l'errore in virgola mobile su venti mesi. → ADR-0008 */
  const grandTotal = useMemo(() => sumBy(series, (row) => row.total), [series])
  const count = useMemo(() => series.reduce((acc, row) => acc + row.count, 0), [series])

  const trendPoints = useMemo(
    () => filled.map((row) => ({ month: row.month, value: row.total })),
    [filled],
  )

  const years = useMemo(() => yearlyTotals(series), [series])
  const extremes = useMemo(
    () => extremeMonths(series, { excludeMonth: partialMonth, until: partialMonth }),
    [partialMonth, series],
  )
  const fixed = useMemo(
    () => fixedShareSeries(series, { excludeMonth: partialMonth, until: partialMonth }),
    [partialMonth, series],
  )
  const recurring = useMemo(() => recurringProfile(visible, person), [person, visible])
  /*
   * Le fisse restano fuori dalla classifica: l'affitto è la spesa più grande di
   * ogni mese, quindi un elenco delle dieci più grandi era dieci volte
   * l'affitto. Quello che si vuole vedere qui sono le botte, e le fisse hanno la
   * loro scheda accanto.
   */
  const top = useMemo(
    () => topExpenses(visible.filter((e) => !e.recurring), person, TOP_EXPENSES),
    [person, visible],
  )

  const slices = useMemo<DonutSlice[]>(
    () => donutSlices(visible, person, lookup),
    [lookup, person, visible],
  )

  /** Categorie di sempre, con quanto pesano in un mese medio. */
  const categories = useMemo(() => {
    const averages = averageByCategory(visible, person, {
      excludeMonth: partialMonth,
      until: partialMonth,
    })
    return categoryBreakdown(visible, person).map((slice) => ({
      ...slice,
      perMonth: averages.get(slice.key) ?? 0,
    }))
  }, [partialMonth, person, visible])

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
    const stackSeries: StackSeries[] = keys.map((key) => ({
      key,
      label: lookup.label(key),
      color: lookup.color(key),
    }))
    return { rows, series: stackSeries }
  }, [filled, lookup, person, visible])

  if (series.length === 0) {
    return (
      <>
        <div className="page-head is-tight">
          <h1>📊 Statistiche</h1>
          <VacationToggle />
        </div>
        <Card title="Non c'è ancora storia">
          <p className="empty">
            Serve almeno un mese di spese. <Link to="/">Torna al riepilogo</Link>.
          </p>
        </Card>
      </>
    )
  }

  const firstMonth = series[0]?.month ?? partialMonth
  const lastMonth = series[series.length - 1]?.month ?? partialMonth

  return (
    <>
      <div className="page-head is-tight">
        <h1>📊 Statistiche</h1>
        <p className="page-sub">
          {monthLabel(firstMonth)} → {monthLabel(lastMonth)} · quota di{' '}
          {config.people[person].name}
        </p>
        <VacationToggle />
      </div>

      <div className="stack">
        <div className="kpi-row">
          <StatTile
            label="Speso in tutto"
            value={formatEuro(grandTotal, { decimals: 0 })}
            hint={`${count} voci in ${series.length} mesi`}
          />
          <StatTile
            label="Media al mese"
            value={formatEuro(average.perMonth, { decimals: 0 })}
            hint={`su ${average.months} mesi, ${monthLabelShort(partialMonth)} escluso`}
            aside={<Sparkline values={filled.map((row) => row.total)} />}
          />
          <StatTile
            label="Il mese base"
            value={formatEuro(recurring.monthlyBase, { decimals: 0 })}
            hint={`${recurring.rows.length} voci fisse che tornano`}
          />
          <StatTile
            label="Parte incomprimibile"
            value={formatPct(fixed.average, { decimals: 0 })}
            hint="quota media delle fisse sul mese"
          />
        </div>

        <Card
          title="Andamento mensile"
          note={`Quota di ${config.people[person].name}, ${trendPoints.length} mesi`}
        >
          {/* Solo da leggere: il mese si sceglie nel Riepilogo, che è la pagina
              dove serve. */}
          <TrendChart points={trendPoints} average={average.perMonth} />
        </Card>

        <Card
          title="Anno per anno"
          note="I mesi osservati stanno in tabella: un anno da tre mesi non si confronta col totale"
        >
          {/* Quattro colonne e non sei: su 336px la quinta finisce fuori, e
              «quante voci» e «quanto di fisse» hanno già la loro scheda. */}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Anno</th>
                  <th className="cell-num">Mesi</th>
                  <th className="cell-num">Totale</th>
                  <th className="cell-num">Al mese</th>
                </tr>
              </thead>
              <tbody>
                {years.map((year) => (
                  <tr key={year.year}>
                    <td>{year.year}</td>
                    <td className="cell-num">{year.months}</td>
                    <td className="cell-num">{formatEuro(year.total, { decimals: 0 })}</td>
                    <td className="cell-num">{formatEuro(year.perMonth, { decimals: 0 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card
          title="Composizione della spesa"
          note={`Categorie mese per mese, ultimi ${STACK_MONTHS} mesi`}
        >
          <StackedMonths rows={stack.rows} series={stack.series} />
        </Card>

        <div className="grid-2">
          <Card title="Dove sono finiti i soldi, da sempre" note="Categorie su tutta la storia">
            <CategoryDonut slices={slices} total={grandTotal} centerCaption="quota tua" />
          </Card>

          {/*
            Tre colonne: la quota è già la torta qui accanto, e il conto delle
            voci — provato — mandava la tabella 44px fuori dallo schermo, cioè
            una colonna che nessuno vede.
          */}
          <Card title="Le categorie di sempre" note="Quanto pesa ciascuna in un mese medio">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th className="cell-num">Totale</th>
                    <th className="cell-num">Al mese</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((row) => (
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
                      <td className="cell-num">{formatEuro(row.total, { decimals: 0 })}</td>
                      <td className="cell-num">{formatEuro(row.perMonth, { decimals: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="grid-2">
          <Card title="Il mese più caro e il più leggero" note={`${monthLabel(partialMonth)} è escluso: è ancora in corso`}>
            <div className="kpi-row">
              <StatTile
                label={extremes.highest ? monthLabel(extremes.highest.month) : 'Il più caro'}
                value={extremes.highest ? formatEuro(extremes.highest.total, { decimals: 0 }) : '—'}
                hint={
                  extremes.highest
                    ? `${extremes.highest.count} voci · ${formatEuro(extremes.highest.fixed, { decimals: 0 })} di fisse`
                    : 'serve un po’ di storia'
                }
              />
              <StatTile
                label={extremes.lowest ? monthLabel(extremes.lowest.month) : 'Il più leggero'}
                value={extremes.lowest ? formatEuro(extremes.lowest.total, { decimals: 0 }) : '—'}
                hint={
                  extremes.lowest
                    ? `${extremes.lowest.count} voci · ${formatEuro(extremes.lowest.fixed, { decimals: 0 })} di fisse`
                    : 'serve un po’ di storia'
                }
              />
            </div>
          </Card>

          <Card
            title="Quanto pesa la parte fissa"
            note={`Affitto, bollette e abbonamenti sul totale del mese · ${monthLabel(partialMonth)} escluso`}
          >
            <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div className="stat-value">{formatPct(fixed.average, { decimals: 0 })}</div>
                <div className="stat-hint">in media, sui {fixed.points.length} mesi osservati</div>
              </div>
              {/* La quota, non gli euro: due mesi possono avere le stesse fisse e
                  quote diversissime. */}
              <Sparkline values={fixed.points.map((point) => point.share * 100)} width={120} height={40} />
            </div>
            <dl className="kv" style={{ marginTop: 12, marginBottom: 0 }}>
              <div className="kv-row">
                <dt>Il mese più vincolato</dt>
                <dd className="num">
                  {fixed.highest
                    ? `${formatPct(fixed.highest.share, { decimals: 0 })} · ${monthLabel(fixed.highest.month)}`
                    : '—'}
                </dd>
              </div>
              <div className="kv-row">
                <dt>Il più libero</dt>
                <dd className="num">
                  {fixed.lowest
                    ? `${formatPct(fixed.lowest.share, { decimals: 0 })} · ${monthLabel(fixed.lowest.month)}`
                    : '—'}
                </dd>
              </div>
            </dl>
          </Card>
        </div>

        <div className="grid-2">
          <Card
            title="Le fisse che tornano ogni mese"
            note={`Il mese base costa ${formatEuro(recurring.monthlyBase, { decimals: 0 })}`}
          >
            {recurring.rows.length === 0 ? (
              <p className="empty">Nessuna spesa segnata come fissa.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Voce</th>
                      <th className="cell-num">Al mese</th>
                      <th className="cell-num">Mesi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recurring.rows.map((row) => (
                      <tr key={`${row.title}-${row.category}`}>
                        <td>
                          <span className="row" style={{ gap: 6 }}>
                            <span
                              className="chip-dot"
                              style={{ background: lookup.color(row.category) }}
                              aria-hidden="true"
                            />
                            {row.title}
                          </span>
                        </td>
                        <td className="cell-num">{formatEuro(row.perMonth)}</td>
                        <td className="cell-num">{row.months}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="card-foot">
              Raggruppate per titolo. La colonna dei mesi è la spia: una voce «fissa» comparsa una
              volta sola probabilmente non lo è.
            </div>
          </Card>

          <Card
            title={`Le ${TOP_EXPENSES} botte più grandi`}
            note="Quota tua, fisse escluse: l'affitto vincerebbe dieci volte su dieci"
          >
            <ExpenseList
              expenses={top}
              person={person}
              lookup={lookup}
              onSelect={setSelected}
              emptyText="Nessuna spesa in archivio."
            />
            <div className="card-foot">
              <Link to="/spese">Vedi tutte le spese →</Link>
            </div>
          </Card>
        </div>
      </div>

      {selected ? (
        <ExpenseSheet expense={selected} lookup={lookup} onClose={() => setSelected(null)} />
      ) : null}
    </>
  )
}
