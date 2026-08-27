/**
 * Riepilogo: la risposta a «quanto margine ho questo mese», e subito sotto il
 * perché — dove sono finiti i soldi e se è tanto o poco rispetto al solito.
 *
 * Tutto quello che sta qui **guarda il mese scelto**. L'andamento su diciotto
 * mesi e la composizione mese per mese sono in Statistiche: un selettore del
 * mese che non cambia metà della pagina è una promessa non mantenuta.
 * → ADR-0034
 */

import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { BarList } from '../components/charts/BarList'
import { CategoryDonut, type DonutSlice } from '../components/charts/CategoryDonut'
import { Sparkline } from '../components/charts/Sparkline'
import { VacationToggle } from '../components/Controls'
import { ExpenseList } from '../components/ExpenseList'
import { ExpenseSheet } from '../components/ExpenseSheet'
import { MarginMeter } from '../components/MarginMeter'
import { MonthStrip } from '../components/MonthStrip'
import { Card, DeltaLabel, Notice, StatTile, useToast } from '../components/ui'
import { donutSlices } from '../domain/categories'
import { currentMonthKey, monthLabel, monthLabelShort } from '../domain/dates'
import { EMPTY_INCOME, computeMargin, marginView } from '../domain/income'
import { newSettlement } from '../domain/settlement'
import { formatEuro, relativeChange, toCents } from '../domain/money'
import {
  averageByCategory,
  averageMonthly,
  categoryBreakdown,
  compareSameDays,
  compareToAverage,
  comparePeriods,
  compareYearOverYear,
  coupleBalance,
  expensesOfMonth,
  fillMonthGaps,
  findMonth,
  projectMonth,
  topExpenses,
} from '../domain/selectors'
import type { Expense, PersonId } from '../domain/types'
import { usePageData } from './usePageData'

export function Home(): ReactNode {
  const {
    chart,
    config,
    dataset,
    view,
    month,
    setMonth,
    lookup,
    visible,
    series,
    today,
    hideIncome,
    toggleHideIncome,
    addSettlement,
  } = usePageData()
  const [selected, setSelected] = useState<Expense | null>(null)
  const toast = useToast()
  const person = view.person

  /* Il mese in corso è parziale: escluderlo dalla media evita di confrontarlo con se stesso. */
  const partialMonth = currentMonthKey()

  const monthExpenses = useMemo(() => expensesOfMonth(visible, month), [visible, month])
  const monthTotal = useMemo(() => findMonth(series, month), [series, month])
  const average = useMemo(
    () => averageMonthly(series, { excludeMonth: partialMonth, until: partialMonth }),
    [series, partialMonth],
  )

  /*
   * Le fisse attese si stimano sugli **ultimi dodici mesi**, non su tutta la
   * storia, e sono l'unica media con una finestra mobile.
   *
   * I tricount partono da ottobre 2024 ma l'affitto compare da dicembre:
   * ottobre fa 79 € di fisse e novembre 3,60 €, due mesi che non sono mai
   * esistiti così. Tenerli dentro fa 487,61 € contro i 539,03 € degli ultimi
   * dodici, e quella differenza è tratteggio che manca nella barra e soldi che
   * sembrano spendibili e non lo sono. Il resto delle medie resta su tutta la
   * storia: là la domanda è «rispetto a come vivo di solito», qui è «quanto mi
   * aspetta a fine mese». → ADR-0056
   */
  const fixedBase = useMemo(
    () =>
      averageMonthly(series, { excludeMonth: partialMonth, until: partialMonth, lastN: 12 })
        .fixedPerMonth,
    [series, partialMonth],
  )
  const projection = useMemo(
    () => projectMonth(monthTotal, today, fixedBase),
    [fixedBase, monthTotal, today],
  )

  const profile = person === 'me' ? config.income.me : (config.income.partner ?? EMPTY_INCOME)
  const margin = useMemo(() => computeMargin(monthTotal, projection, profile), [monthTotal, profile, projection])
  /*
   * Al componente arriva la vista, non il risultato: a guadagni oscurati i
   * campi segreti sono già `null` e non c'è nessun numero da velare a schermo.
   * → ADR-0015
   */
  const marginShown = useMemo(() => marginView(margin, { hideIncome }), [hideIncome, margin])

  /*
   * Il saldo **non** entra nel margine e non passa da `visibleFor()`: vuole
   * tutte le spese, e le quote sono già contate una volta sola nelle proprie
   * uscite. Qui serve solo da mostrare, girato dal punto di vista di chi
   * guarda — il calcolo ha un segno fisso. → ADR-0058, ADR-0019
   */
  const owedToMe = useMemo(() => {
    const totale = coupleBalance(dataset.expenses, dataset.settlements, config.balance)
    return person === 'me' ? totale.balance : -totale.balance
  }, [config.balance, dataset.expenses, dataset.settlements, person])

  /*
   * Chiudere il conto dal Riepilogo, con lo stesso costruttore della pagina
   * Saldo: il verso lo decide il segno del saldo, e sbagliarlo sposterebbe un
   * debito dalla parte opposta senza che se ne accorga nessuno. → ADR-0060
   */
  const other: PersonId = person === 'me' ? 'partner' : 'me'

  /* Niente `useMemo` attorno: `MarginMeter` non è memorizzato, quindi un
     oggetto nuovo a ogni render non costa un render in più — e memorizzarlo
     vorrebbe dire ragionare su quale versione di `settleAll` resta congelata
     dentro. */
  const balance = {
    owedToMe,
    otherName: config.people[other].name,
    onSettle: () => {
      const settlement = newSettlement({
        owedToViewer: owedToMe,
        viewer: person,
        other,
        amount: owedToMe,
        date: today,
      })
      if (settlement === null) return
      addSettlement(settlement)
      toast.show(`Rimborso di ${formatEuro(settlement.amount)} registrato.`)
    },
  }

  const slices = useMemo<DonutSlice[]>(
    () => donutSlices(monthExpenses, person, lookup),
    [lookup, monthExpenses, person],
  )

  const versusAverage = useMemo(() => {
    const averages = averageByCategory(visible, person, {
      excludeMonth: partialMonth,
      until: partialMonth,
    })
    const current = categoryBreakdown(monthExpenses, person)
    return compareToAverage(current, averages)
      .filter((row) => toCents(row.current) !== 0 || toCents(row.average) !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 6)
  }, [monthExpenses, partialMonth, person, visible])

  const filled = useMemo(() => fillMonthGaps(series), [series])
  const sparkValues = useMemo(() => filled.slice(-12).map((row) => row.total), [filled])

  const quarter = useMemo(() => comparePeriods(series, month, 3), [month, series])
  const yoy = useMemo(() => compareYearOverYear(series, month), [month, series])
  /* A pari giorni, non contro il mese scorso intero: vedi ADR-0035. */
  const lastMonth = useMemo(() => compareSameDays(visible, person, month, today), [
    month,
    person,
    today,
    visible,
  ])
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
      {/*
        Una riga sola invece di cinque blocchi impilati. Il titolo, il contesto e
        l'unico interruttore che riguarda questa pagina stanno insieme; chi
        guarda è passato nella testata dell'app, e il mese lo dice la striscia.
      */}
      <div className="page-head is-tight">
        <h1>{monthLabel(month)}</h1>
        <p className="page-sub">
          {config.people[person].name} · {monthTotal.count}{' '}
          {monthTotal.count === 1 ? 'spesa' : 'spese'}
        </p>
        <VacationToggle />
      </div>

      {/* La striscia sta in testa alla pagina, non accanto al grafico: è il
          comando principale del Riepilogo, e cercarlo cinque schede più in
          basso per cambiare mese sarebbe peggio del menù che sostituisce.
          `filled` va bene com'è: ha già `month` e `total`. */}
      <MonthStrip
        items={filled}
        selected={month}
        current={partialMonth}
        average={average.perMonth}
        onSelect={setMonth}
      />

      <div className="stack">
        {!marginShown.known ? (
          <Notice tone="warn">
            Il profilo entrate non è ancora compilato, quindi il margine non si può calcolare.{' '}
            <Link to="/impostazioni">Vedi come impostarlo</Link>.
          </Notice>
        ) : null}

        <Card>
          <MarginMeter
            view={marginShown}
            projection={projection}
            /* Un solo anno precedente esiste nei dati: è un riferimento, non una media. */
            lastYear={toCents(yoy.lastYear) > 0 ? { month: yoy.lastYearMonth, total: yoy.lastYear } : null}
            balance={balance}
            onToggleHidden={toggleHideIncome}
          />
        </Card>

        {/*
          Il confronto col mese scorso sta in alto perché è la statistica che si
          guarda per prima sul mese in corso: sapere di aver speso 968 € serve a
          poco senza sapere che a luglio, agli stessi giorni, erano 1050 €.
        */}
        <Card title="Confronti" note={`Quota di ${config.people[person].name}`}>
          <div className="kpi-row">
            <StatTile
              label={`Contro ${monthLabelShort(lastMonth.previousMonth)}`}
              value={formatEuro(lastMonth.current, { decimals: 0 })}
              hint={
                lastMonth.wholePrevious
                  ? `${monthLabelShort(lastMonth.previousMonth)} intero: ${formatEuro(lastMonth.previous, { decimals: 0 })}`
                  : `nei primi ${lastMonth.days} giorni: ${formatEuro(lastMonth.previous, { decimals: 0 })}`
              }
              delta={<DeltaLabel change={lastMonth.deltaPct} />}
            />
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
            {inProgress
              ? `Il mese è in corso, quindi il confronto col mese scorso è tagliato agli stessi ${lastMonth.days} giorni: un mese a metà contro un mese intero direbbe «vai benissimo» ogni 5 del mese. `
              : ''}
            Il confronto sui tre mesi parte dal mese precedente a quello selezionato, per la stessa
            ragione.
          </div>
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

        <div className="grid-2">
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

          <Card title="Fisse contro variabili" note="Quanto del mese è incomprimibile">
            {/* Una sola famiglia di dati, due tonalità dello stesso blu: non sono categorie diverse. */}
            <BarList
              items={[
                {
                  key: 'fisse',
                  label: 'Fisse',
                  value: monthTotal.fixed,
                  color: chart.seq[5] ?? '#256abf',
                  /* La stessa media con cui si stimano le fisse attese: due
                     numeri diversi per la stessa cosa, sulla stessa pagina,
                     sarebbero solo da spiegare. */
                  sub:
                    fixedBase > 0
                      ? `media ${formatEuro(fixedBase, { decimals: 0 })} su 12 mesi`
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
            <div className="card-foot">
              {/* Chi cercava l'andamento su diciotto mesi lo cercava qui: dirgli
                  dov'è andato costa una riga. */}
              <Link to="/statistiche">Andamento, composizione e storia → Statistiche</Link>
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
