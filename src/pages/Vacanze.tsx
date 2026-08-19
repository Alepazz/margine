/**
 * Vacanze: ogni viaggio consultabile per anno e per luogo, con quanto è costato
 * in tutto e quanto al giorno — che è il numero con cui si confrontano davvero
 * due viaggi di durata diversa.
 */

import { useMemo, useState, type ReactNode } from 'react'

import { BarList } from '../components/charts/BarList'
import { CategoryDonut, type DonutSlice } from '../components/charts/CategoryDonut'
import { PersonSwitch } from '../components/Controls'
import { ExpenseList } from '../components/ExpenseList'
import { ExpenseSheet } from '../components/ExpenseSheet'
import { Card, Notice, StatTile } from '../components/ui'
import { formatDate } from '../domain/dates'
import { formatEuro } from '../domain/money'
import { tripPlaces, tripStats, tripsByYear } from '../domain/selectors'
import type { Expense } from '../domain/types'
import { usePageData } from './usePageData'

export function Vacanze(): ReactNode {
  const { config, dataset, view, lookup, chart } = usePageData()
  const person = view.person
  const [selectedTrip, setSelectedTrip] = useState<string | null>(null)
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null)

  const stats = useMemo(
    () => tripStats(dataset.expenses, dataset.trips, person),
    [dataset.expenses, dataset.trips, person],
  )
  const byYear = useMemo(() => tripsByYear(stats), [stats])
  const [year, setYear] = useState<number | 'all'>('all')

  const shown = year === 'all' ? stats : (byYear.find((y) => y.year === year)?.trips ?? [])
  const totalShare = shown.reduce((acc, t) => acc + Math.round(t.share * 100), 0) / 100
  const totalCouple = shown.reduce((acc, t) => acc + Math.round(t.couple * 100), 0) / 100
  const totalDays = shown.reduce((acc, t) => acc + t.days, 0)
  const places = useMemo(() => tripPlaces(shown), [shown])

  const trip = shown.find((t) => t.trip.id === selectedTrip) ?? null

  /* Una sola famiglia di voci: rampa a un colore, come per il gatto, non tinte diverse. */
  const tripSlices = useMemo<DonutSlice[]>(
    () =>
      (trip?.parts ?? []).map((slice, index) => ({
        key: slice.key,
        label: lookup.subLabel(config.tripCategory, slice.key),
        value: slice.total,
        pct: slice.pct,
        color: chart.seq[Math.max(0, chart.seq.length - 2 - index * 2)] ?? chart.seq[3] ?? '#3987e5',
      })),
    [chart.seq, config.tripCategory, lookup, trip],
  )

  if (dataset.trips.length === 0) {
    return (
      <>
        <div className="page-head">
          <div className="page-head-text">
            <h1>🌍 Vacanze</h1>
          </div>
        </div>
        <Notice>
          Nessun viaggio ancora registrato. Al prossimo import si aggiungono i viaggi con luogo,
          anno e date, e questa pagina si popola da sé.
        </Notice>
      </>
    )
  }

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1>🌍 Vacanze</h1>
          <p className="page-sub">
            {shown.length} {shown.length === 1 ? 'viaggio' : 'viaggi'} · quota di{' '}
            {config.people[person].name}
          </p>
        </div>
        <div className="row" style={{ marginLeft: 'auto' }}>
          <PersonSwitch />
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Anno">
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={year === 'all'}
          onClick={() => {
            setYear('all')
            setSelectedTrip(null)
          }}
        >
          Tutti gli anni
        </button>
        {byYear.map((entry) => (
          <button
            key={entry.year}
            type="button"
            role="tab"
            className="tab"
            aria-selected={year === entry.year}
            onClick={() => {
              setYear(entry.year)
              setSelectedTrip(null)
            }}
          >
            {entry.year}
          </button>
        ))}
      </div>

      <div className="stack">
        <div className="kpi-row">
          <StatTile
            label="La tua quota"
            value={formatEuro(totalShare, { decimals: 0 })}
            hint={`su ${formatEuro(totalCouple, { decimals: 0 })} in due`}
          />
          <StatTile label="Giorni di viaggio" value={String(totalDays)} />
          <StatTile
            label="Media al giorno"
            value={totalDays > 0 ? formatEuro(totalShare / totalDays) : '—'}
            hint="quota tua per giorno"
          />
          <StatTile
            label="Viaggio più caro"
            value={
              shown.length > 0
                ? formatEuro(Math.max(...shown.map((t) => t.share)), { decimals: 0 })
                : '—'
            }
            hint={shown.length > 0 ? [...shown].sort((a, b) => b.share - a.share)[0]?.trip.name : undefined}
          />
        </div>

        <Card title="Quanto è costato ogni viaggio" note="Tocca un viaggio per aprirlo">
          <div className="stack" style={{ gap: 6 }}>
            {shown.map((entry) => (
              <button
                key={entry.trip.id}
                type="button"
                className="list-row"
                onClick={() => setSelectedTrip(entry.trip.id === selectedTrip ? null : entry.trip.id)}
                aria-expanded={entry.trip.id === selectedTrip}
              >
                <span className="list-main">
                  {/* Nome e luogo coincidono spesso («Creta · Creta»): non ripeterlo. */}
                  <span className="list-title">
                    {entry.trip.name}
                    {entry.trip.place === entry.trip.name ? '' : ` · ${entry.trip.place}`}
                  </span>
                  <span className="list-meta">
                    <span>
                      {formatDate(entry.trip.start)} — {formatDate(entry.trip.end)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {entry.days} giorni · {formatEuro(entry.perDayShare)} al giorno
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{entry.count} voci</span>
                  </span>
                </span>
                <span className="list-amount">
                  {formatEuro(entry.share, { decimals: 0 })}
                  <span className="list-amount-sub">
                    <br />
                    su {formatEuro(entry.couple, { decimals: 0 })} in due
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <BarList
              items={shown.map((entry) => ({
                key: entry.trip.id,
                label: entry.trip.place,
                value: entry.share,
                color: chart.seq[4] ?? '#2a78d6',
                sub: `${formatEuro(entry.perDayShare)}/g`,
              }))}
            />
          </div>
        </Card>

        {trip ? (
          <Card
            title={
              trip.trip.place === trip.trip.name
                ? trip.trip.name
                : `${trip.trip.name} — ${trip.trip.place}`
            }
            note={`${formatDate(trip.trip.start)} — ${formatDate(trip.trip.end)} · ${trip.days} giorni`}
            action={
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedTrip(null)}>
                Chiudi
              </button>
            }
          >
            <div className="kpi-row" style={{ marginBottom: 14 }}>
              {/* Senza centesimi: su telefono «1448,30 €» non ci sta nella piastrella
                  e viene troncato. I centesimi esatti stanno nelle righe qui sotto. */}
              <StatTile label="La tua quota" value={formatEuro(trip.share, { decimals: 0 })} />
              <StatTile
                label="Costato a voi due"
                value={formatEuro(trip.couple, { decimals: 0 })}
                hint={`${config.people[person === 'me' ? 'partner' : 'me'].name} ${formatEuro(
                  trip.couple - trip.share,
                  { decimals: 0 },
                )}`}
              />
              <StatTile label="Al giorno (tua quota)" value={formatEuro(trip.perDayShare)} />
              <StatTile label="Al giorno (in due)" value={formatEuro(trip.perDayCouple)} />
            </div>
            {trip.others > 0 || trip.welfare > 0 ? (
              <dl className="kv" style={{ marginBottom: 14 }}>
                {trip.others > 0 ? (
                  <>
                    <div className="kv-row">
                      <dt>Il conto di tutto il gruppo</dt>
                      <dd className="num">{formatEuro(trip.total)}</dd>
                    </div>
                    <div className="kv-row">
                      <dt>Di cui quota di chi era con voi</dt>
                      <dd className="num">{formatEuro(trip.others)}</dd>
                    </div>
                  </>
                ) : null}
                {trip.welfare > 0 ? (
                  <div className="kv-row">
                    <dt>Pagato col welfare, non di tasca</dt>
                    <dd className="num">{formatEuro(trip.welfare)}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
            <div className="grid-2">
              <div>
                <h3 style={{ marginBottom: 8 }}>Come si è speso</h3>
                <CategoryDonut slices={tripSlices} total={trip.share} centerCaption="quota tua" />
              </div>
              {/* Un viaggio vero fa 65 voci: senza tetto la colonna sfonda la pagina. */}
              <div className="scroll-pane">
                <h3 style={{ marginBottom: 8 }}>Le voci del viaggio</h3>
                <ExpenseList
                  expenses={trip.expenses}
                  person={person}
                  lookup={lookup}
                  onSelect={setSelectedExpense}
                  showSource={false}
                  detail="subcategory"
                />
              </div>
            </div>
          </Card>
        ) : null}

        <div className="grid-2">
          <Card title="Per luogo" note="Dove sono andati i soldi delle vacanze">
            <BarList
              items={places.map((place) => ({
                key: place.place,
                label: place.place,
                value: place.share,
                color: chart.seq[4] ?? '#2a78d6',
                sub: place.visits > 1 ? `${place.visits} volte` : undefined,
              }))}
            />
          </Card>

          <Card title="Per anno" note="Quanto pesano le vacanze, anno su anno">
            <BarList
              items={byYear.map((entry) => ({
                key: String(entry.year),
                label: String(entry.year),
                value: entry.share,
                color: chart.seq[5] ?? '#256abf',
                sub: `${entry.trips.length} ${entry.trips.length === 1 ? 'viaggio' : 'viaggi'}`,
              }))}
            />
          </Card>
        </div>
      </div>

      {selectedExpense ? (
        <ExpenseSheet
          expense={selectedExpense}
          lookup={lookup}
          onClose={() => setSelectedExpense(null)}
        />
      ) : null}
    </>
  )
}
