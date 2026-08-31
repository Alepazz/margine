/**
 * Elenco spese: una riga per voce, toccabile per aprire il dettaglio.
 *
 * Con `pageSize` l'elenco si impagina da sé. Serve perché una pagina che
 * mostra tutto diventa un nastro: il tricount di casa da solo faceva undici­mila
 * pixel di altezza, e sotto le prime venti righe non c'è più niente da capire.
 *
 * Con `byDay` le righe si intervallano di giorni, come un calendario, e ogni
 * giorno porta il proprio totale. Non è un ornamento: nel nastro di prima due
 * spese dello stesso giorno e due di giorni lontani si leggevano identiche.
 * → ADR-0077
 */

import { Fragment, useEffect, useState, type ReactNode } from 'react'

import type { CategoryLookup } from '../domain/categories'
import { dayHeading, formatDate } from '../domain/dates'
import { formatEuro, toCents } from '../domain/money'
import { shareOf, totalShare } from '../domain/selectors'
import type { Expense, PersonId } from '../domain/types'
import { ShowMore } from './ui'

/** Le spese raggruppate per giorno, nell'ordine in cui arrivano. */
function groupByDay(expenses: readonly Expense[]): [string, Expense[]][] {
  const days = new Map<string, Expense[]>()
  for (const expense of expenses) {
    const list = days.get(expense.date)
    if (list) list.push(expense)
    else days.set(expense.date, [expense])
  }
  return [...days.entries()]
}

export function ExpenseList({
  expenses,
  person,
  lookup,
  onSelect,
  today,
  showSource = true,
  /**
   * Nelle pagine di una sola categoria (il gatto, un viaggio) ripetere il nome
   * della categoria su ogni riga non dice niente: lì serve la sottocategoria.
   */
  detail = 'category',
  emptyText = 'Nessuna spesa qui.',
  pageSize,
  byDay = false,
}: {
  expenses: readonly Expense[]
  person: PersonId
  lookup: CategoryLookup
  onSelect: (expense: Expense) => void
  /**
   * Oggi. **Obbligatorio**: è quello che distingue una spesa già avvenuta da una
   * datata avanti, e le seconde si mostrano spente. Un valore di ripiego qui
   * avrebbe voluto dire che una pagina dimenticata le mostra accese senza che
   * nessuno se ne accorga — che è esattamente il difetto da togliere.
   */
  today: string
  showSource?: boolean
  detail?: 'category' | 'subcategory'
  emptyText?: string
  /** Quante righe alla volta. Senza, si mostra tutto. */
  pageSize?: number
  /**
   * Righe intervallate dai giorni, col totale del giorno a destra. Ha senso
   * **solo su un elenco ordinato per data**: su un ordinamento per importo i
   * giorni si ripeterebbero sparsi, e un'intestazione che torna tre volte non è
   * un calendario. Lo decide chi chiama, che è l'unico a sapere come ha
   * ordinato. → ADR-0077
   */
  byDay?: boolean
}): ReactNode {
  const [limit, setLimit] = useState(() => pageSize ?? Number.POSITIVE_INFINITY)

  /* Cambia l'insieme — un filtro, un'altra persona — e si riparte dalla prima
     pagina: restare a «mostrate 80 di 3» non vorrebbe dire niente. */
  useEffect(() => setLimit(pageSize ?? Number.POSITIVE_INFINITY), [expenses, pageSize])

  if (expenses.length === 0) return <p className="empty">{emptyText}</p>

  const shown = limit >= expenses.length ? expenses : expenses.slice(0, limit)
  const rest = expenses.length - shown.length

  /**
   * Una riga.
   *
   * Una spesa datata avanti è **già inserita e non ancora avvenuta**: sta
   * nell'elenco perché è un fatto registrato, ma spenta, perché non ha ancora
   * eroso niente e nel saldo entrerà dal primo giorno del suo mese (→ ADR-0064).
   * Il grigio da solo non direbbe perché, quindi accanto c'è la parola.
   */
  const row = (expense: Expense): ReactNode => {
    const share = shareOf(expense, person)
    const shared = toCents(share) !== toCents(expense.amount)
    const future = expense.date > today
    return (
      <button
        type="button"
        className={`list-row${future ? ' is-future' : ''}`}
        key={expense.id}
        onClick={() => onSelect(expense)}
      >
        <span className="chip-dot" style={{ background: lookup.color(expense.category) }} aria-hidden="true" />
        <span className="list-main">
          <span className="list-title">{expense.title}</span>
          <span className="list-meta">
            {/* Col calendario la data sta già nell'intestazione, due righe più
                su e per tutto il gruppo: ripeterla su ogni riga è la stessa
                cosa scritta due volte a otto pixel di distanza. */}
            {byDay ? null : (
              <>
                <span>{formatDate(expense.date)}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span>
              {detail === 'subcategory' && expense.subcategory
                ? lookup.subLabel(expense.category, expense.subcategory)
                : `${lookup.emoji(expense.category)} ${lookup.label(expense.category)}`}
            </span>
            {showSource ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{lookup.tricountTitle(expense.tricount)}</span>
              </>
            ) : null}
            {future ? (
              <span className="chip" title="Datata avanti: non è ancora avvenuta">
                futura
              </span>
            ) : null}
            {expense.tax730 ? <span className="chip is-tax">730</span> : null}
            {expense.welfare ? (
              <span className="chip" title="Pagata col welfare: fuori dal budget del mese">
                welfare
              </span>
            ) : null}
            {(expense.receiptLinks?.length ?? 0) > 0 ? (
              <span title="Scontrino allegato" aria-label="Scontrino allegato">
                🧾
              </span>
            ) : null}
          </span>
        </span>
        <span className="list-amount">
          {formatEuro(share)}
          {shared ? (
            <span className="list-amount-sub">
              <br />
              su {formatEuro(expense.amount)}
            </span>
          ) : null}
        </span>
      </button>
    )
  }

  return (
    <>
      <div className="list">
        {byDay
          ? groupByDay(shown).map(([day, items]) => (
              <Fragment key={day}>
                <div className={`list-day${day > today ? ' is-future' : ''}`}>
                  <span>{dayHeading(day, today)}</span>
                  {/* La quota di chi guarda, come gli importi delle righe che
                      stanno sotto: un totale che sommasse un'altra grandezza
                      non tornerebbe con la colonna che ha accanto. */}
                  <span className="list-day-total">{formatEuro(totalShare(items, person))}</span>
                </div>
                {items.map(row)}
              </Fragment>
            ))
          : shown.map(row)}
      </div>

      {pageSize ? (
        <ShowMore rest={rest} step={pageSize} onMore={() => setLimit((n) => n + pageSize)} />
      ) : null}
    </>
  )
}
