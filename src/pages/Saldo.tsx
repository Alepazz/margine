/**
 * Chi deve cosa a chi: il pezzo per cui Tricount esisteva.
 *
 * Registrare le spese non basta a saperlo — serve anche sapere **quando vi siete
 * saldati**, e quei movimenti non sono spese: non entrano in nessun conto del
 * mese. Le spese contano già solo la propria quota, quindi quando il rimborso
 * arriva il conto torna esattamente a quella; contarlo come entrata sarebbe
 * contarlo due volte. → ADR-0019
 */

import { useMemo, useState, type ReactNode } from 'react'

import { Card, Notice, ShowMore, StatTile, useToast } from '../components/ui'
import { formatDate, todayIso } from '../domain/dates'
import { newSettlementId } from '../domain/ids'
import { formatEuro, toCents } from '../domain/money'
import { ledgerLabel } from '../domain/expense-rules'
import { coupleBalance } from '../domain/selectors'
import type { Settlement } from '../domain/types'
import { usePageData } from './usePageData'

const MOVEMENTS_SHOWN = 25

/**
 * «Devi a Alessio» è sbagliato, «devi ad Alessio» no. La d eufonica davanti a
 * vocale non è una finezza: i nomi qui arrivano dalla configurazione, quindi non
 * si può scegliere la frase giusta una volta per tutte.
 */
function aTo(name: string): string {
  return /^[aeiouàèéìòù]/i.test(name.trim()) ? 'ad' : 'a'
}

export function Saldo(): ReactNode {
  const { config, dataset, view, addSettlement, removeSettlement } = usePageData()
  const toast = useToast()
  const person = view.person
  const other = person === 'me' ? 'partner' : 'me'
  const [customAmount, setCustomAmount] = useState('')
  const [limit, setLimit] = useState(MOVEMENTS_SHOWN)

  const balance = useMemo(
    () => coupleBalance(dataset.expenses, dataset.settlements, config.balance),
    [config.balance, dataset.expenses, dataset.settlements],
  )

  /* Il nome leggibile di un tricount, dalla stessa funzione che usa il pannello
     che sposta una spesa: le vacanze ne hanno uno per viaggio, e quel nome sta
     nei dati del viaggio e non nella chiave. */
  const groupLabel = (key: string): string =>
    ledgerLabel(key, dataset.trips, config.sourceLabels)

  /*
   * Il calcolo ha un segno fisso — positivo = `partner` deve a `me` — e qui si
   * gira per chi sta guardando. Due viste dello stesso dato, una verità sola.
   */
  const owedToMe = person === 'me' ? balance.balance : -balance.balance
  const cents = toCents(owedToMe)
  const settledUp = cents === 0
  const debtor = cents > 0 ? other : person
  const creditor = cents > 0 ? person : other

  const record = (amount: number) => {
    if (toCents(amount) <= 0) {
      toast.show('L’importo del rimborso deve essere maggiore di zero.')
      return
    }
    const date = todayIso()
    const settlement: Settlement = {
      id: newSettlementId(date),
      date,
      from: debtor,
      to: creditor,
      amount: Math.abs(Math.round(amount * 100) / 100),
    }
    addSettlement(settlement)
    setCustomAmount('')
    toast.show(`Rimborso di ${formatEuro(settlement.amount)} registrato.`)
  }

  const shown = balance.movements.slice(0, limit)
  const rest = balance.movements.length - shown.length

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1>⚖️ Saldo</h1>
          {/* Nessuna data qui: ogni tricount parte dalla sua, e una sola data
              descriverebbe il ripiego invece dei movimenti. → ADR-0022 */}
          <p className="page-sub">
            Fra {config.people.me.name} e {config.people.partner.name} ·{' '}
            {balance.groups.length} tricount
          </p>
        </div>
      </div>

      <div className="stack">
        <Card>
          <div className="hero">
            <span className="hero-label">
              {settledUp
                ? 'Siete in pari'
                : cents > 0
                  ? `${config.people[other].name} deve a te`
                  : `Devi ${aTo(config.people[other].name)} ${config.people[other].name}`}
            </span>
            <span className={`hero-value is-${settledUp ? 'ok' : cents > 0 ? 'ok' : 'attenzione'}`}>
              {formatEuro(Math.abs(owedToMe), { decimals: 0 })}
            </span>
            <span className="hero-hint">
              {balance.undeclared.length > 0
                ? `Totale parziale: ${balance.undeclared.length} ${
                    balance.undeclared.length === 1 ? 'tricount non ha' : 'tricount non hanno'
                  } un punto di partenza dichiarato.`
                : /* Con un rimborso registrato il totale non è più la somma dei
                     tricount: dirlo comunque sarebbe una riga che non torna. */
                  toCents(balance.settled) > 0
                  ? `Somma di ${balance.groups.length} tricount, meno i rimborsi registrati.`
                  : settledUp
                    ? 'Nessun rimborso in sospeso.'
                    : `Somma di ${balance.groups.length} tricount.`}
            </span>
          </div>

          {!settledUp ? (
            <div className="stack" style={{ gap: 8, marginTop: 12 }}>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn btn-primary" onClick={() => record(Math.abs(owedToMe))}>
                  Saldato tutto ({formatEuro(Math.abs(owedToMe), { decimals: 0 })})
                </button>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <input
                  className="input"
                  style={{ flex: '1 1 120px' }}
                  inputMode="decimal"
                  placeholder="Importo parziale"
                  aria-label="Importo del rimborso parziale"
                  value={customAmount}
                  onChange={(event) => setCustomAmount(event.target.value)}
                />
                <button
                  type="button"
                  className="btn"
                  disabled={customAmount.trim() === ''}
                  onClick={() => record(Number(customAmount.replace(',', '.')))}
                >
                  Registra
                </button>
              </div>
              <p className="hint">
                Il rimborso va da {config.people[debtor].name} {aTo(config.people[creditor].name)}{' '}
                {config.people[creditor].name}, con la data di oggi.
              </p>
            </div>
          ) : null}
        </Card>

        <div className="kpi-row">
          <StatTile
            label={`Anticipato da ${config.people.me.name}`}
            value={formatEuro(balance.frontedByMe, { decimals: 0 })}
            hint={`quote di ${config.people.partner.name}`}
          />
          <StatTile
            label={`Anticipato da ${config.people.partner.name}`}
            value={formatEuro(balance.frontedByPartner, { decimals: 0 })}
            hint={`quote di ${config.people.me.name}`}
          />
          <StatTile
            label="Rimborsi registrati"
            value={formatEuro(balance.settled, { decimals: 0 })}
            hint={`${dataset.settlements.length} movimenti`}
          />
          {/* Non è «il saldo di partenza»: quello ora sta in ogni tricount. Qui
              resta il residuo che non appartiene a nessuno di essi. → ADR-0022 */}
          <StatTile
            label="Residuo fuori dai tricount"
            value={formatEuro(balance.opening, { decimals: 0 })}
            hint={`al ${formatDate(balance.since)}`}
          />
        </div>

        {balance.undeclared.length > 0 ? (
          <Notice tone="warn">
            {/* Uno o più di uno cambia mezza frase: senza le due varianti viene
                fuori «questo tricount… il loro numero». */}
            {balance.undeclared.length === 1
              ? 'Un tricount non ha un punto di partenza dichiarato: '
              : `${balance.undeclared.length} tricount non hanno un punto di partenza dichiarato: `}
            <strong>{balance.undeclared.map(groupLabel).join(', ')}</strong>.{' '}
            {balance.undeclared.length === 1 ? 'Il suo numero' : 'Il loro numero'} qui è solo «cosa è
            successo dopo il {formatDate(balance.since)}», quindi non è confrontabile con quello che
            mostra Tricount. Per{' '}
            {balance.undeclared.length === 1 ? 'allinearlo apri quel tricount' : 'allinearli apri ogni tricount'}
            , leggi il saldo di oggi e mettilo in <code>data/config.json</code> sotto{' '}
            <code>balance.groups</code> (positivo se {config.people.partner.name} deve{' '}
            {aTo(config.people.me.name)} {config.people.me.name}), poi ricifra.
          </Notice>
        ) : null}

        <Card
          title="Un saldo per tricount"
          note="Su Tricount ci si salda un gruppo alla volta: qui stanno separati, così ogni riga si confronta con la sua"
        >
          <div className="list">
            {balance.groups.map((group) => {
              /* Il segno è quello del calcolo: si gira per chi guarda. */
              const owed = person === 'me' ? group.balance : -group.balance
              const groupCents = toCents(owed)
              return (
                <div className="list-row is-static" key={group.key}>
                  <span className="list-main">
                    <span className="list-title">{groupLabel(group.key)}</span>
                    <span className="list-meta">
                      {group.declared ? (
                        <span>
                          da {formatDate(group.since)} · partenza {formatEuro(group.opening)}
                        </span>
                      ) : (
                        <span>punto di partenza non dichiarato</span>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>
                        {group.movements} {group.movements === 1 ? 'movimento' : 'movimenti'}
                      </span>
                    </span>
                  </span>
                  <span className="list-amount">
                    {/* Un tricount senza punto di partenza e senza movimenti non
                        è «in pari»: è ignoto, e dirlo pari sarebbe inventare. */}
                    {!group.declared && group.movements === 0 ? (
                      <span className="list-amount-sub">da leggere</span>
                    ) : (
                      <span className={`delta ${groupCents >= 0 ? 'is-good' : 'is-bad'}`}>
                        {groupCents === 0
                          ? 'in pari'
                          : `${groupCents > 0 ? '+' : '−'}${formatEuro(Math.abs(owed))}`}
                      </span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="card-foot">
            Il segno è dal tuo punto di vista: <strong>più</strong> vuol dire che{' '}
            {config.people[other].name} deve a te, <strong>meno</strong> che devi tu. Un tricount
            saldato fuori da Tricount, dove quindi il rimborso non figura, si dichiara come punto di
            partenza a zero con la data del giorno.
          </div>
        </Card>

        {toCents(balance.outsideCouple) > 0 ? (
          <Notice>
            {formatEuro(balance.outsideCouple)} di quote vostre sono state anticipate da qualcun
            altro, in vacanza. Non entrano in questo saldo: quel debito è verso di lui, non fra voi
            due.
          </Notice>
        ) : null}

        <Card
          title="Cosa ha mosso il saldo"
          note={`${balance.movements.length} movimenti, ognuno dal punto di partenza del suo tricount`}
        >
          {balance.movements.length === 0 ? (
            <p className="empty">
              Ancora niente da registrare. Ogni spesa che uno dei due anticipa per l'altro compare
              qui, dal punto di partenza del suo tricount in avanti.
            </p>
          ) : (
            <>
              <div className="list">
                {shown.map((movement) => {
                  /* Il segno è quello del calcolo: si gira per chi guarda. */
                  const delta = person === 'me' ? movement.delta : -movement.delta
                  const isSettlement = movement.kind === 'settlement'
                  return (
                    <div className="list-row is-static" key={`${movement.kind}-${movement.id}`}>
                      <span
                        className="chip-dot"
                        style={{ background: isSettlement ? 'var(--good)' : 'var(--series-rest)' }}
                        aria-hidden="true"
                      />
                      <span className="list-main">
                        <span className="list-title">{movement.title}</span>
                        <span className="list-meta">
                          <span>{formatDate(movement.date)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{isSettlement ? 'rimborso' : groupLabel(movement.group)}</span>
                        </span>
                      </span>
                      <span className="list-amount">
                        <span className={`delta ${delta > 0 ? 'is-good' : 'is-bad'}`}>
                          {delta > 0 ? '+' : '−'}
                          {formatEuro(Math.abs(delta))}
                        </span>
                        {isSettlement ? (
                          <>
                            <br />
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => {
                                removeSettlement(movement.id)
                                toast.show('Rimborso annullato.')
                              }}
                            >
                              Annulla
                            </button>
                          </>
                        ) : null}
                      </span>
                    </div>
                  )
                })}
              </div>
              <ShowMore
                rest={rest}
                step={MOVEMENTS_SHOWN}
                gender="m"
                onMore={() => setLimit((n) => n + MOVEMENTS_SHOWN)}
              />
            </>
          )}
          <div className="card-foot">
            Il saldo non tocca il margine del mese: le spese contano già solo la tua quota, quindi
            quando il rimborso arriva il conto torna esattamente a quella. Contarlo come entrata
            sarebbe contarlo due volte.
          </div>
        </Card>
      </div>
    </>
  )
}
