/**
 * Un progetto: una cosa che si compra una volta, e che non è la vita di ogni mese.
 *
 * La rotta è **generica** (`/progetto/:id`) e il titolo arriva dai dati: il repo
 * è pubblico, e «casa a Senigallia» scritto nel codice sarebbe in chiaro per
 * sempre in `git log`, che è esattamente ciò che `expenses.json.enc` esiste per
 * evitare. → ADR-0074, ADR-0067
 *
 * Tre insiemi, e stanno **tutti e tre dentro questo tricount**: il capitale che
 * si spende una volta (rogito, caparra, notaio), la rata che torna ogni mese, e
 * le spese normali un po' grosse (il frigo, i lavori). Solo il primo sta fuori
 * dai conti del mese e dal saldo di ogni giorno; gli altri due sono vita di
 * tutti i giorni e si comportano come tale.
 *
 * `recurring` è un **sottoinsieme** di `current`, quindi quei due numeri non si
 * sommano: è la stessa regola della pagina Casa. → ADR-0079, ADR-0074, ADR-0017
 */

import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'

import { BarList } from '../components/charts/BarList'
import { ExpenseList } from '../components/ExpenseList'
import { ExpenseSheet } from '../components/ExpenseSheet'
import { AmountInput, Card, Notice, Segmented, StatTile, useToast } from '../components/ui'
import { ProjectBar } from '../components/ProjectBar'
import { formatDate, monthKeyOf, monthLabel } from '../domain/dates'
import { formatEuro, toCents } from '../domain/money'
import { subsetStats } from '../domain/selectors'
import { newSettlement, settlementDirection } from '../domain/settlement'
import { aTo } from '../domain/text'
import { titleOf, type Expense } from '../domain/types'
import { usePageData, useProjects } from './usePageData'

const LIST_PAGE = 15

export function Progetto(): ReactNode {
  const { id } = useParams<{ id: string }>()
  const {
    config,
    view,
    lookup,
    chart,
    today,
    addSettlement,
    removeSettlement,
    updateTricount,
  } = usePageData()
  const toast = useToast()
  const person = view.person
  const other = person === 'me' ? 'partner' : 'me'
  const [selected, setSelected] = useState<Expense | null>(null)
  const [custom, setCustom] = useState('')
  const [scope, setScope] = useState<'tutte' | 'capitale' | 'correnti'>('tutte')

  /* Dallo stesso posto dell'anteprima nell'hub e dell'avviso nel Saldo: i tre
     devono dire lo stesso numero. Cercare qui dentro risolve in una riga anche
     il caso «il tricount esiste ma non è un progetto», perché l'elenco contiene
     solo quelli. → ADR-0074 */
  const stats = useProjects().find((project) => project.tricount.id === id)
  const tricount = stats?.tricount

  /* La rata: sottoinsieme di `current`, mai sommata al capitale. `subsetStats`
     serve per le medie al mese, che `ProjectSlice` non calcola. */
  const rateStats = useMemo(
    () => subsetStats(stats?.recurring.expenses ?? [], person),
    [stats, person],
  )
  const correnteStats = useMemo(
    () => subsetStats(stats?.current.expenses ?? [], person),
    [stats, person],
  )

  if (tricount === undefined || stats === undefined) {
    return (
      <>
        <div className="page-head">
          <div className="page-head-text">
            <h1>Progetto</h1>
          </div>
        </div>
        <Notice tone="warn">
          Questo progetto non esiste. Torna a <Link to="/esplora">Esplora</Link>: i progetti sono i
          tricount marcati come tali quando si creano.
        </Notice>
      </>
    )
  }

  /* Il segno del calcolo è fisso — positivo = `partner` deve a `me` — e qui si
     gira per chi guarda, come nel saldo di ogni giorno. → ADR-0019 */
  const owedToMe = person === 'me' ? stats.balance : -stats.balance
  const cents = toCents(owedToMe)
  const verso = settlementDirection(owedToMe, person, other)
  /* «In pari» **è** l'assenza di un verso, non un secondo confronto sul segno:
     `settlementDirection` torna `null` se e solo se il saldo è a zero, ed è la
     garanzia per cui ADR-0062 le ha dato un tipo che sa dire «nessuno». */
  const pari = verso === null

  const registra = (amount: number): void => {
    const settlement = newSettlement({
      owedToViewer: owedToMe,
      viewer: person,
      other,
      amount,
      date: today,
      /* Marcato col progetto: è quello che lo tiene fuori dal saldo di ogni
         giorno, dove un rimborso da diecimila euro cancellerebbe per mesi la
         domanda vera — «chi ha pagato l'ultima spesa». → ADR-0075 */
      tricount: tricount.id,
    })
    if (settlement === null) {
      toast.show('L’importo del rimborso deve essere maggiore di zero.')
      return
    }
    addSettlement(settlement)
    setCustom('')
    toast.show(`Rimborso di ${formatEuro(settlement.amount)} registrato su «${tricount.name}».`)
  }

  const titolo = titleOf(tricount)
  const capitale = stats.capital
  const corrente = stats.current
  const elenchi = [
    { key: 'tutte', label: 'Tutte', expenses: stats.all.expenses, total: stats.all.total },
    { key: 'capitale', label: 'Capitale', expenses: capitale.expenses, total: capitale.total },
    { key: 'correnti', label: 'Correnti', expenses: corrente.expenses, total: corrente.total },
  ] as const
  const elenco = elenchi.find((e) => e.key === scope) ?? elenchi[0]

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1>{titolo}</h1>
          <p className="page-sub">
            {stats.all.count} {stats.all.count === 1 ? 'voce' : 'voci'}
            {stats.firstDate ? ` · dal ${formatDate(stats.firstDate)}` : ''}
          </p>
        </div>
      </div>

      <div className="stack">
        {stats.all.count === 0 ? (
          <Notice>
            Nessuna spesa ancora. Aggiungine una col <strong>+</strong> scegliendo «{titolo}» come
            tricount: da lì in poi questa pagina si riempie da sola. Sul rogito, sulla caparra e sul
            notaio metti la spunta <strong>«fuori dai conti del mese»</strong>; sul frigo e sulla
            rata no.
          </Notice>
        ) : null}

        <Card>
          <div className="hero">
            <span className="hero-label">Quanto è costato finora, in tutto</span>
            <span className="hero-value">{formatEuro(stats.all.total, { decimals: 0 })}</span>
            <span className="hero-hint">
              {/* «Con e senza rogito» in una riga: è la domanda che si fa chi
                  guarda questa pagina, e chiederle due schede sarebbe chiederle
                  una sottrazione. */}
              {formatEuro(capitale.total, { decimals: 0 })} di capitale ·{' '}
              {formatEuro(corrente.total, { decimals: 0 })} di spese correnti
            </span>
          </div>
        </Card>

        {/*
          La barra dei rimborsi. Sta in alto perché è la domanda con cui si apre
          questa pagina — «a che punto siamo» — e la disegna lo stesso
          componente del Riepilogo, così i due non possono divergere. → ADR-0080
        */}
        <Card title="A che punto siamo con i rimborsi" note="Solo il capitale: la rata si salda col saldo di ogni giorno">
          <ProjectBar stats={stats} person={person} people={config.people} />
          {toCents(stats.gross) === 0 ? (
            <p className="empty">
              Nessun capitale anticipato, quindi non c'è niente da rimborsare. La barra compare alla
              prima spesa segnata «fuori dai conti del mese».
            </p>
          ) : null}
        </Card>

        <div className="kpi-row">
          <StatTile
            label={`Capitale messo da ${config.people.me.name}`}
            value={formatEuro(capitale.people.me.paid, { decimals: 0 })}
            hint={`gli spetta ${formatEuro(capitale.people.me.share, { decimals: 0 })}`}
          />
          <StatTile
            label={`Capitale messo da ${config.people.partner.name}`}
            value={formatEuro(capitale.people.partner.paid, { decimals: 0 })}
            hint={`le spetta ${formatEuro(capitale.people.partner.share, { decimals: 0 })}`}
          />
          <StatTile
            label="Rimborsi registrati"
            value={formatEuro(stats.settled, { decimals: 0 })}
            hint={`${stats.settlements.length} ${
              stats.settlements.length === 1 ? 'movimento' : 'movimenti'
            }`}
          />
          <StatTile
            label="Ultima spesa"
            value={stats.lastDate ? formatDate(stats.lastDate) : '—'}
            smallValue
          />
        </div>

        <Card
          title="Chi deve a chi, sul capitale"
          note="Tenuto separato dal saldo di ogni giorno, dove stanno rata e spese correnti"
        >
          <div className="hero">
            <span className="hero-label">
              {pari
                ? 'Siete in pari sul capitale di questo progetto'
                : cents > 0
                  ? `${config.people[other].name} deve a te`
                  : `Devi ${aTo(config.people[other].name)} ${config.people[other].name}`}
            </span>
            <span className={`hero-value is-${pari || cents > 0 ? 'ok' : 'attenzione'}`}>
              {formatEuro(Math.abs(owedToMe), { decimals: 0 })}
            </span>
          </div>

          {/*
            Il modulo appare a **tutti e due**, come nella pagina Saldo e al
            contrario del pulsante nel Riepilogo. Non è un'incoerenza con
            ADR-0062: là il pulsante sta accanto a una cifra e basta, e a chi
            incassa chiederebbe di dichiarare un pagamento che non ha fatto lui;
            qui sopra c'è una riga che dice il verso a parole, e un capitale che
            rientra a rate lo registra chi tiene il conto della casa — che è
            l'unico a sapere che quel bonifico è arrivato.
          */}
          {verso !== null ? (
            <div className="stack" style={{ gap: 8, marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => registra(Math.abs(owedToMe))}
              >
                Saldato tutto ({formatEuro(Math.abs(owedToMe), { decimals: 0 })})
              </button>
              <div className="row" style={{ gap: 6 }}>
                <div style={{ flex: '1 1 120px' }}>
                  <AmountInput
                    value={custom}
                    onChange={setCustom}
                    placeholder="Importo parziale"
                    ariaLabel="Importo del rimborso parziale"
                  />
                </div>
                <button
                  type="button"
                  className="btn"
                  disabled={custom.trim() === ''}
                  onClick={() => registra(Number(custom.replace(',', '.')))}
                >
                  Registra
                </button>
              </div>
              <p className="hint">
                Il rimborso va da {config.people[verso.debtor].name}{' '}
                {aTo(config.people[verso.creditor].name)} {config.people[verso.creditor].name}, con
                la data di oggi. Un capitale rientra a rate, e ogni rata si registra qui: questi
                rimborsi non toccano il saldo di ogni giorno, che resta la domanda «chi ha pagato la
                spesa».
              </p>
            </div>
          ) : null}

          {stats.deferred > 0 ? (
            <div className="card-foot">
              {stats.deferred === 1 ? 'Una voce è datata' : `${stats.deferred} voci sono datate`}{' '}
              dopo {monthLabel(monthKeyOf(today))}, quindi non {stats.deferred === 1 ? 'è' : 'sono'}{' '}
              ancora {stats.deferred === 1 ? 'contata' : 'contate'} qui: entrerà dal primo giorno del
              suo mese.
            </div>
          ) : null}
        </Card>

        {/*
          La sezione dei rimborsi. È «lo strumento con cui Federica vede a che
          punto è», chiesto da Alessio il 01/09/2026: sta subito sotto il conto,
          e non in fondo alla pagina.
        */}
        {stats.settlements.length > 0 ? (
          <Card
            title="I rimborsi di questo progetto"
            note="Solo questi: quelli di ogni giorno stanno nella pagina Saldo"
          >
            <div className="list">
              {stats.settlements.map((settlement) => (
                <div className="list-row is-static" key={settlement.id}>
                  <span className="list-main">
                    <span className="list-title">
                      {config.people[settlement.from].name} → {config.people[settlement.to].name}
                    </span>
                    <span className="list-meta">
                      <span>{formatDate(settlement.date)}</span>
                      {settlement.note ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{settlement.note}</span>
                        </>
                      ) : null}
                    </span>
                  </span>
                  <span className="list-amount">{formatEuro(settlement.amount)}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      removeSettlement(settlement.id)
                      toast.show('Rimborso annullato.')
                    }}
                  >
                    Annulla
                  </button>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {capitale.count > 0 ? (
          <Card title="Chi ha anticipato il capitale" note="Soldi usciti dal conto, non quote">
            <BarList
              items={[
                {
                  key: 'me',
                  label: config.people.me.name,
                  value: capitale.people.me.paid,
                  color: chart.seq[5] ?? '#256abf',
                },
                {
                  key: 'partner',
                  label: config.people.partner.name,
                  value: capitale.people.partner.paid,
                  color: chart.seq[3] ?? '#3987e5',
                },
              ]}
            />
            <div className="card-foot">
              Anticipare non è sostenere: la quota di ciascuno è metà del conto, e la differenza fra
              le due colonne è il debito qui sopra.
            </div>
          </Card>
        ) : null}

        {/*
          Un elenco solo con un filtro, invece di tre elenchi uno sotto l'altro:
          «quanto abbiamo speso per Senigallia, con e senza rogito» è **una**
          domanda con un interruttore, non tre schede da confrontare a occhio.
        */}
        {stats.all.count > 0 ? (
          <Card
            title="Le spese del progetto"
            note={`${elenco.expenses.length} ${
              elenco.expenses.length === 1 ? 'voce' : 'voci'
            } · ${formatEuro(elenco.total, { decimals: 0 })}`}
          >
            <div style={{ marginBottom: 12 }}>
              <Segmented
                value={scope}
                onChange={setScope}
                ariaLabel="Quali spese mostrare"
                options={elenchi.map((e) => ({ value: e.key, label: e.label }))}
              />
            </div>
            {elenco.expenses.length === 0 ? (
              <p className="empty">Nessuna voce in questo insieme.</p>
            ) : (
              <ExpenseList
                today={today}
                expenses={elenco.expenses}
                person={person}
                lookup={lookup}
                onSelect={setSelected}
                showSource={false}
                pageSize={LIST_PAGE}
              />
            )}
          </Card>
        ) : null}

        {/*
          La rata. Sottoinsieme delle correnti, quindi la scheda lo dice: questo
          numero è **dentro** quello lì sopra, non in aggiunta. → ADR-0017
        */}
        {tricount.recurringCategory ? (
          <Card
            title={`Quanto costa ogni mese: ${lookup.label(tricount.recurringCategory)}`}
            note="Dentro le spese correnti, non in aggiunta: entra nel mese fra le fisse e nel saldo di ogni giorno"
          >
            {rateStats.count === 0 ? (
              <p className="empty">
                Nessuna spesa ancora in «{lookup.label(tricount.recurringCategory)}». Quando la rata
                arriva, si registra qui dentro come spesa normale — con la spunta{' '}
                <strong>«ricorrente»</strong> e <strong>senza</strong> quella del capitale: è la
                prima a farla scontare dallo spendibile dal primo giorno del mese, la seconda la
                farebbe sparire dai conti.
              </p>
            ) : (
              <div className="kpi-row">
                <StatTile
                  label="Pagato finora"
                  value={formatEuro(rateStats.total, { decimals: 0 })}
                  hint={`${rateStats.count} ${rateStats.count === 1 ? 'rata' : 'rate'} su ${
                    rateStats.months
                  } mesi`}
                />
                <StatTile
                  label="Media al mese"
                  value={formatEuro(rateStats.monthlyAvgTotal, { decimals: 0 })}
                  hint={`la tua quota: ${formatEuro(rateStats.monthlyAvgShare, { decimals: 0 })}`}
                />
                <StatTile
                  label="La tua quota, in tutto"
                  value={formatEuro(rateStats.share, { decimals: 0 })}
                />
              </div>
            )}
          </Card>
        ) : null}

        {corrente.count > 0 ? (
          <Card
            title="Quanto pesa ogni mese, tutto compreso"
            note="Rata e spese correnti insieme: è la parte che entra nei conti di ogni giorno"
          >
            <div className="kpi-row">
              <StatTile
                label="Spese correnti"
                value={formatEuro(corrente.total, { decimals: 0 })}
                hint={`${corrente.count} ${corrente.count === 1 ? 'voce' : 'voci'}`}
              />
              <StatTile
                label="Media al mese"
                value={formatEuro(correnteStats.monthlyAvgTotal, { decimals: 0 })}
                hint={`la tua quota: ${formatEuro(correnteStats.monthlyAvgShare, { decimals: 0 })}`}
              />
              <StatTile
                label="La tua quota, in tutto"
                value={formatEuro(correnteStats.share, { decimals: 0 })}
              />
            </div>
          </Card>
        ) : null}

        <Card
          title="Come è contato questo progetto"
          note="Quali spese stanno nei conti di ogni giorno e quali no"
        >
          <div className="stack" style={{ gap: 8 }}>
            <p className="hint">
              <strong>Il capitale</strong> — rogito, caparra, notaio: la spesa con la spunta «fuori
              dai conti del mese». Non entra in margine, medie, proiezioni e confronti, e il suo
              debito non entra nel saldo di ogni giorno. Resta nella pagina Spese, nel 730 e qui.
            </p>
            <p className="hint">
              <strong>La rata</strong> — la categoria qui sotto: entra nel mese fra le spese fisse,
              come l'affitto che sostituisce, ed entra nel saldo di ogni giorno. Nel Riepilogo il
              saldo la nomina, con un «di cui».
            </p>
            <p className="hint">
              <strong>Le altre</strong> — il frigo, i lavori, i mobili: spese normali un po' grosse.
              Entrano nel mese fra le variabili e nel saldo di ogni giorno, come qualunque spesa.
            </p>
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label className="label" htmlFor="progetto-categoria">
              La categoria della rata
            </label>
            <select
              id="progetto-categoria"
              className="select"
              value={tricount.recurringCategory ?? ''}
              onChange={(event) => {
                /* La stringa vuota vuol dire «togli», e non `undefined`: un
                   `tricount-edit` si applica come `{ ...tricount, ...campi }` e
                   `JSON.stringify` butta via le chiavi indefinite prima che la
                   coda arrivi in localStorage. → ADR-0018 */
                updateTricount(tricount.id, { recurringCategory: event.target.value })
                toast.show(
                  event.target.value === ''
                    ? 'Categoria della rata tolta.'
                    : `Categoria della rata: ${lookup.label(event.target.value)}.`,
                )
              }}
            >
              <option value="">Nessuna</option>
              {config.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.emoji ? `${category.emoji} ` : ''}
                  {category.label}
                </option>
              ))}
            </select>
            <p className="hint">
              Per una casa comprata è la categoria del mutuo. Serve a <strong>riconoscere</strong> la
              rata, non a spostarla: è quella che il Riepilogo nomina nel «di cui» del saldo. Senza,
              il «di cui» conterebbe anche il condominio.
            </p>
          </div>
        </Card>
      </div>

      {selected ? (
        <ExpenseSheet expense={selected} lookup={lookup} onClose={() => setSelected(null)} />
      ) : null}
    </>
  )
}
