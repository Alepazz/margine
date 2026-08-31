/**
 * Un progetto: una cosa che si compra una volta, e che non è la vita di ogni mese.
 *
 * La rotta è **generica** (`/progetto/:id`) e il titolo arriva dai dati: il repo
 * è pubblico, e «casa a Senigallia» scritto nel codice sarebbe in chiaro per
 * sempre in `git log`, che è esattamente ciò che `expenses.json.enc` esiste per
 * evitare. → ADR-0074, ADR-0067
 *
 * Due insiemi che **non si sommano mai**, come nella pagina Casa: quello che il
 * progetto è costato una volta (il tricount) e quello che continua a costare
 * ogni mese (la categoria del mutuo, che vive nel tricount delle fisse ed erode
 * il margine come l'affitto che sostituisce). Fonderli in un numero solo
 * mescolerebbe un capitale e una rata. → ADR-0074, ADR-0017
 */

import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'

import { BarList } from '../components/charts/BarList'
import { ExpenseList } from '../components/ExpenseList'
import { ExpenseSheet } from '../components/ExpenseSheet'
import { AmountInput, Card, Notice, StatTile, useToast } from '../components/ui'
import { formatDate, monthKeyOf, monthLabel } from '../domain/dates'
import { formatEuro, toCents } from '../domain/money'
import { projectRecurring, subsetStats } from '../domain/selectors'
import { newSettlement, settlementDirection } from '../domain/settlement'
import { aTo } from '../domain/text'
import { titleOf, type Expense } from '../domain/types'
import { usePageData, useProjects } from './usePageData'

const LIST_PAGE = 15

export function Progetto(): ReactNode {
  const { id } = useParams<{ id: string }>()
  const {
    config,
    dataset,
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

  /* Dallo stesso posto dell'anteprima nell'hub e dell'avviso nel Saldo: i tre
     devono dire lo stesso numero. Cercare qui dentro risolve in una riga anche
     il caso «il tricount esiste ma non è un progetto», perché l'elenco contiene
     solo quelli. → ADR-0074 */
  const stats = useProjects().find((project) => project.tricount.id === id)
  const tricount = stats?.tricount

  /* Il secondo insieme: la rata, che vive altrove e non si somma al primo. */
  const rate = useMemo(
    () => (tricount === undefined ? [] : projectRecurring(dataset.expenses, tricount)),
    [dataset.expenses, tricount],
  )
  const rateStats = useMemo(() => subsetStats(rate, person), [rate, person])

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

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1>{titolo}</h1>
          <p className="page-sub">
            {stats.count} {stats.count === 1 ? 'voce' : 'voci'}
            {stats.firstDate ? ` · dal ${formatDate(stats.firstDate)}` : ''} · fuori dai conti del
            mese
          </p>
        </div>
      </div>

      <div className="stack">
        {stats.count === 0 ? (
          <Notice>
            Nessuna spesa ancora. Aggiungine una col <strong>+</strong> scegliendo «{titolo}» come
            tricount: da lì in poi questa pagina si riempie da sola.
          </Notice>
        ) : null}

        <Card>
          <div className="hero">
            <span className="hero-label">Quanto è costato finora</span>
            <span className="hero-value">{formatEuro(stats.total, { decimals: 0 })}</span>
            <span className="hero-hint">
              {toCents(stats.total) === toCents(stats.couple)
                ? `La tua quota è ${formatEuro(stats.people[person].share, { decimals: 0 })}.`
                : `${formatEuro(stats.couple, { decimals: 0 })} vostri, il resto di altri.`}
            </span>
          </div>
        </Card>

        <div className="kpi-row">
          <StatTile
            label={`Messi da ${config.people.me.name}`}
            value={formatEuro(stats.people.me.paid, { decimals: 0 })}
            hint={`gli spetta ${formatEuro(stats.people.me.share, { decimals: 0 })}`}
          />
          <StatTile
            label={`Messi da ${config.people.partner.name}`}
            value={formatEuro(stats.people.partner.paid, { decimals: 0 })}
            hint={`le spetta ${formatEuro(stats.people.partner.share, { decimals: 0 })}`}
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
          title="Chi deve a chi"
          note="Il debito di questo progetto, tenuto separato da quello di ogni giorno"
        >
          <div className="hero">
            <span className="hero-label">
              {pari
                ? 'Siete in pari su questo progetto'
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
                la data di oggi. Un progetto si rientra a rate, e ogni rata si registra qui: questi
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

        {stats.count > 0 ? (
          <Card title="Chi ha anticipato" note="Soldi usciti dal conto, non quote">
            <BarList
              items={[
                {
                  key: 'me',
                  label: config.people.me.name,
                  value: stats.people.me.paid,
                  color: chart.seq[5] ?? '#256abf',
                },
                {
                  key: 'partner',
                  label: config.people.partner.name,
                  value: stats.people.partner.paid,
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

        {stats.count > 0 ? (
          <Card
            title="Le spese del progetto"
            note={`${stats.count} ${stats.count === 1 ? 'voce' : 'voci'}`}
          >
            <ExpenseList
              today={today}
              expenses={stats.expenses}
              person={person}
              lookup={lookup}
              onSelect={setSelected}
              showSource={false}
              pageSize={LIST_PAGE}
            />
          </Card>
        ) : null}

        {stats.settlements.length > 0 ? (
          <Card title="I rimborsi di questo progetto" note="Solo questi: quelli di ogni giorno stanno nella pagina Saldo">
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

        {/*
          Il secondo insieme. Mai sommato al primo, e la scheda lo dice: sopra
          c'è un capitale, qui una rata che torna ogni mese ed erode il margine
          come l'affitto. → ADR-0074, ADR-0017
        */}
        {tricount.recurringCategory ? (
          <Card
            title={`Quanto costa ogni mese: ${lookup.label(tricount.recurringCategory)}`}
            note="Sta nei conti di ogni giorno, non qui sopra: questi due numeri non si sommano"
          >
            {rateStats.count === 0 ? (
              <p className="empty">
                Nessuna spesa ancora in «{lookup.label(tricount.recurringCategory)}». Quando la rata
                arriva, si registra come una spesa normale nel tricount delle fisse, con la spunta
                «ricorrente»: è quella spunta a farla scontare dallo spendibile dal primo giorno del
                mese.
              </p>
            ) : (
              <>
                <div className="kpi-row" style={{ marginBottom: 14 }}>
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
                <ExpenseList
                  today={today}
                  expenses={rateStats.expenses}
                  person={person}
                  lookup={lookup}
                  onSelect={setSelected}
                  pageSize={LIST_PAGE}
                />
              </>
            )}
          </Card>
        ) : null}

        <Card
          title="Come è contato questo progetto"
          note="Le regole che lo tengono fuori dai conti di ogni giorno"
        >
          <div className="stack" style={{ gap: 8 }}>
            <p className="hint">
              Le sue spese <strong>non entrano</strong> in margine, medie, proiezioni e confronti: un
              capitale in un mese renderebbe quel mese incomparabile con ogni altro. Restano nella
              pagina Spese, nel 730 e qui.
            </p>
            <p className="hint">
              Il suo debito <strong>non entra</strong> nel saldo di ogni giorno, e i rimborsi
              registrati qui non lo toccano.
            </p>
            <p className="hint">
              Quello che il progetto continua a costare ogni mese — la rata di un mutuo — vive invece
              nei conti di tutti i giorni, come una spesa fissa qualunque.
            </p>
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label className="label" htmlFor="progetto-categoria">
              La categoria della spesa ricorrente
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
                    ? 'Categoria ricorrente tolta.'
                    : `Categoria ricorrente: ${lookup.label(event.target.value)}.`,
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
              Per una casa comprata è la categoria del mutuo. Le sue spese si mostrano qui sopra come
              un secondo insieme, e non si sommano mai al costo del progetto.
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
