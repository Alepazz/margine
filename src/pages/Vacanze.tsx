/**
 * Vacanze: ogni viaggio consultabile per anno e per luogo, con quanto è costato
 * in tutto e quanto al giorno — che è il numero con cui si confrontano davvero
 * due viaggi di durata diversa.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { BarList } from '../components/charts/BarList'
import { CategoryDonut, type DonutSlice } from '../components/charts/CategoryDonut'
import { Globe, type GlobeMark } from '../components/charts/Globe'
import { ExpenseList } from '../components/ExpenseList'
import { ExpenseSheet } from '../components/ExpenseSheet'
import { TricountForm } from '../components/TricountForm'
import { Card, Notice, StatTile, useToast } from '../components/ui'
import { formatDate } from '../domain/dates'
import { formatEuro, toCents } from '../domain/money'
import { tripPlaces, tripStats, tripsByYear } from '../domain/selectors'
import { tripTitleOf, tripsOf, type Expense } from '../domain/types'
import { usePageData } from './usePageData'

export function Vacanze(): ReactNode {
  const { config, dataset, view, lookup, chart, addTricount, updateTricount } = usePageData()
  const toast = useToast()
  const person = view.person
  const [selectedTrip, setSelectedTrip] = useState<string | null>(null)
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null)
  const [creating, setCreating] = useState(false)
  const detail = useRef<HTMLElement | null>(null)
  const tricountIds = useMemo(() => new Set(dataset.tricounts.map((t) => t.id)), [dataset.tricounts])
  const trips = useMemo(() => tripsOf(dataset.tricounts), [dataset.tricounts])

  /*
   * Il dettaglio di un viaggio si apre sotto l'elenco, cioè mille pixel più in
   * basso: senza portarlo a vista, toccare un puntino sul mappamondo sembra non
   * fare niente. Si scorre solo se non è già dove si sta guardando, altrimenti
   * la pagina saltella a ogni tocco.
   */
  useEffect(() => {
    if (!selectedTrip) return
    const node = detail.current
    if (!node) return
    const top = node.getBoundingClientRect().top
    if (top >= 0 && top < window.innerHeight * 0.6) return
    node.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [selectedTrip])

  const stats = useMemo(
    () => tripStats(dataset.expenses, trips, person),
    [dataset.expenses, person, trips],
  )
  const byYear = useMemo(() => tripsByYear(stats), [stats])
  const [year, setYear] = useState<number | 'all'>('all')

  const shown = year === 'all' ? stats : (byYear.find((y) => y.year === year)?.trips ?? [])
  const totalShare = shown.reduce((acc, t) => acc + Math.round(t.share * 100), 0) / 100
  const totalCouple = shown.reduce((acc, t) => acc + Math.round(t.couple * 100), 0) / 100
  const totalDays = shown.reduce((acc, t) => acc + t.days, 0)
  /*
   * Un viaggio può esistere senza spese: i tricount partono da ottobre 2024, i
   * viaggi da prima. I suoi giorni sono un fatto e restano contati, ma nel costo
   * di un giorno di vacanza non entrano — dodici giorni a zero abbasserebbero la
   * media di tutti gli altri, e la media direbbe una cosa falsa.
   */
  const withSpend = shown.filter((t) => t.count > 0)
  const spentDays = withSpend.reduce((acc, t) => acc + t.days, 0)
  const places = useMemo(
    () => tripPlaces(shown).filter((place) => toCents(place.share) > 0),
    [shown],
  )

  const trip = shown.find((t) => t.trip.id === selectedTrip) ?? null

  /* Solo i viaggi che sanno dove sono: gli altri restano nell'elenco sotto. */
  const marks = useMemo<GlobeMark[]>(
    () =>
      shown
        .filter((entry) => entry.trip.coords)
        .map((entry) => ({
          trip: entry.trip,
          lat: entry.trip.coords?.lat ?? 0,
          lon: entry.trip.coords?.lon ?? 0,
          approx: entry.trip.coords?.approx === true,
          label: entry.trip.name,
        })),
    [shown],
  )
  const senzaPosto = shown.filter((entry) => !entry.trip.coords)

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

  if (trips.length === 0) {
    return (
      <>
        <div className="page-head">
          <div className="page-head-text">
            <h1>🌍 Vacanze</h1>
          </div>
        </div>
        <Card
          title="Nessun viaggio ancora"
          note="Aprine uno adesso, oppure lascia che sia il prossimo import a portarli"
          action={
            creating ? null : (
              <button type="button" className="btn btn-sm" onClick={() => setCreating(true)}>
                Nuova vacanza
              </button>
            )
          }
        >
          {creating ? (
            <TricountForm
              takenIds={tricountIds}
              vacation
              onCreate={(candidate) => {
                addTricount(candidate)
                setCreating(false)
                toast.show(`Vacanza «${candidate.name}» aperta.`)
              }}
              onCancel={() => setCreating(false)}
              onProblem={(message) => toast.show(message)}
            />
          ) : (
            <p className="empty">
              Un viaggio nuovo diventa subito un tricount in cui inserire spese.
            </p>
          )}
        </Card>
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
            value={spentDays > 0 ? formatEuro(totalShare / spentDays) : '—'}
            hint={
              withSpend.length === shown.length
                ? 'quota tua per giorno'
                : `quota tua per giorno, sui ${withSpend.length} viaggi con spese registrate`
            }
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

        {marks.length > 0 ? (
          <Card
            title="Dove siete stati"
            note={`${marks.length} ${marks.length === 1 ? 'viaggio' : 'viaggi'} sul mappamondo · trascina per girarlo, pizzica per avvicinarlo, tocca un puntino per aprirlo`}
          >
            <Globe
              marks={marks}
              selected={selectedTrip}
              onSelect={(id) => setSelectedTrip((current) => (current === id ? null : id))}
            />
            <div className="card-foot">
              {/* Al condizionale di proposito: il raggruppamento dipende da come è
                  girato il globo in questo momento, quindi «c'è un gruppo» non è
                  una cosa che questa pagina possa sapere. */}
              Dove due viaggi cadono troppo vicini per essere toccati uno per uno, il puntino porta
              il numero di quanti sono: toccalo e il globo si stringe su di loro finché non si
              separano.{' '}
              {/* I nomi si leggono dai dati: scriverli a mano qui vorrebbe dire
                  che il componente conosce i viaggi di qualcuno in particolare. */}
              {marks.some((m) => m.approx)
                ? `Il cerchio intorno a un puntino vuol dire posizione approssimata — una regione o un paese non hanno un punto, quindi sta al centro: ${marks
                    .filter((m) => m.approx)
                    .map((m) => m.label)
                    .join(', ')}. Si corregge nelle coordinate del viaggio.`
                : ''}
              {senzaPosto.length > 0
                ? ` ${senzaPosto.length} ${senzaPosto.length === 1 ? 'viaggio non ha' : 'viaggi non hanno'} coordinate e ${senzaPosto.length === 1 ? 'sta' : 'stanno'} solo nell'elenco qui sotto.`
                : ''}
            </div>
          </Card>
        ) : null}

        <Card
          title="Quanto è costato ogni viaggio"
          note="Tocca un viaggio per aprirlo"
          action={
            creating ? null : (
              <button type="button" className="btn btn-sm" onClick={() => setCreating(true)}>
                Nuova vacanza
              </button>
            )
          }
        >
          {creating ? (
            <div style={{ marginBottom: 12 }}>
              <TricountForm
                takenIds={tricountIds}
                vacation
                onCreate={(candidate) => {
                  addTricount(candidate)
                  setCreating(false)
                  setSelectedTrip(candidate.id)
                  toast.show(`Vacanza «${candidate.name}» aperta.`)
                }}
                onCancel={() => setCreating(false)}
                onProblem={(message) => toast.show(message)}
              />
            </div>
          ) : null}
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
                    {tripTitleOf(entry.trip)}
                    {entry.trip.place === entry.trip.name ? '' : ` · ${entry.trip.place}`}
                  </span>
                  <span className="list-meta">
                    <span>
                      {formatDate(entry.trip.start)} — {formatDate(entry.trip.end)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {entry.days} giorni
                      {entry.count > 0 ? ` · ${formatEuro(entry.perDayShare)} al giorno` : ''}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{entry.count > 0 ? `${entry.count} voci` : 'nessuna spesa'}</span>
                    {entry.trip.closed ? <span className="chip">conclusa</span> : null}
                  </span>
                </span>
                <span className="list-amount">
                  {/* Zero euro con «su 0 € in due» sotto è rumore: un viaggio
                      senza spese non ha un importo, e il trattino lo dice. */}
                  {entry.count === 0 ? (
                    '—'
                  ) : (
                    <>
                      {formatEuro(entry.share, { decimals: 0 })}
                      <span className="list-amount-sub">
                        <br />
                        su {formatEuro(entry.couple, { decimals: 0 })} in due
                      </span>
                    </>
                  )}
                </span>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <BarList
              items={withSpend.map((entry) => ({
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
            className="scroll-target"
            ref={detail}
            title={
              trip.trip.place === trip.trip.name
                ? tripTitleOf(trip.trip)
                : `${tripTitleOf(trip.trip)} — ${trip.trip.place}`
            }
            note={`${formatDate(trip.trip.start)} — ${formatDate(trip.trip.end)} · ${trip.days} giorni`}
            action={
              <div className="row" style={{ gap: 6 }}>
                {/*
                 * «Conclusa» toglie la vacanza dal menù dove si inserisce una
                 * spesa, e non c'entra col saldo: una vacanza finita può avere
                 * ancora un debito aperto, e deve restare nel Saldo mentre
                 * sparisce da qui. → ADR-0027
                 */}
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    const closed = trip.trip.closed !== true
                    updateTricount(trip.trip.id, { closed })
                    toast.show(
                      closed
                        ? 'Vacanza conclusa: non comparirà fra i tricount in cui inserire una spesa.'
                        : 'Vacanza riaperta.',
                    )
                  }}
                >
                  {trip.trip.closed ? 'Riapri' : 'È conclusa'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedTrip(null)}>
                  Chiudi
                </button>
              </div>
            }
          >
            {/* Un solo avviso per volta: se il viaggio è anche senza spese, quello
                qui sotto dice già che si riapre per aggiungerle. */}
            {trip.trip.closed && trip.count > 0 ? (
              <div style={{ marginBottom: 12 }}>
                <Notice icon="✓">
                  Vacanza conclusa: resta qui e nel saldo, ma non si possono più aggiungere spese
                  (riaprila per farlo).
                </Notice>
              </div>
            ) : null}
            {/*
              Un viaggio senza spese non ha una torta e non ha piastrelle: sono
              quattro zeri e un cerchio vuoto. Ha un posto sul mappamondo e dei
              giorni, e sono quelli che si dicono.
            */}
            {trip.count === 0 ? (
              <Notice>
                Nessuna spesa registrata: questo viaggio sta in archivio per il mappamondo e per il
                conto dei giorni. I tricount partono da ottobre 2024, e prima di allora le spese non
                sono state tracciate — se salta fuori una ricevuta,{' '}
                {trip.trip.closed ? 'riapri la vacanza e aggiungila' : 'aggiungila'}.
              </Notice>
            ) : (
              <>
            <div className="kpi-row" style={{ marginBottom: 14 }}>
              {/* Senza centesimi: su telefono «[cifra rimossa]» non ci sta nella piastrella
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
              </>
            )}
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
