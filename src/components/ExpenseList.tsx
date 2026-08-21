/**
 * Elenco spese: una riga per voce, toccabile per aprire il dettaglio.
 *
 * Con `pageSize` l'elenco si impagina da sé. Serve perché una pagina che
 * mostra tutto diventa un nastro: il tricount di casa da solo faceva undici­mila
 * pixel di altezza, e sotto le prime venti righe non c'è più niente da capire.
 */

import { useEffect, useState, type ReactNode } from 'react'

import type { CategoryLookup } from '../domain/categories'
import { formatDate } from '../domain/dates'
import { formatEuro, toCents } from '../domain/money'
import { shareOf } from '../domain/selectors'
import type { Expense, PersonId } from '../domain/types'
import { ShowMore } from './ui'

export function ExpenseList({
  expenses,
  person,
  lookup,
  onSelect,
  showSource = true,
  /**
   * Nelle pagine di una sola categoria (il gatto, un viaggio) ripetere il nome
   * della categoria su ogni riga non dice niente: lì serve la sottocategoria.
   */
  detail = 'category',
  emptyText = 'Nessuna spesa qui.',
  pageSize,
}: {
  expenses: readonly Expense[]
  person: PersonId
  lookup: CategoryLookup
  onSelect: (expense: Expense) => void
  showSource?: boolean
  detail?: 'category' | 'subcategory'
  emptyText?: string
  /** Quante righe alla volta. Senza, si mostra tutto. */
  pageSize?: number
}): ReactNode {
  const [limit, setLimit] = useState(() => pageSize ?? Number.POSITIVE_INFINITY)

  /* Cambia l'insieme — un filtro, un'altra persona — e si riparte dalla prima
     pagina: restare a «mostrate 80 di 3» non vorrebbe dire niente. */
  useEffect(() => setLimit(pageSize ?? Number.POSITIVE_INFINITY), [expenses, pageSize])

  if (expenses.length === 0) return <p className="empty">{emptyText}</p>

  const shown = limit >= expenses.length ? expenses : expenses.slice(0, limit)
  const rest = expenses.length - shown.length

  return (
    <>
      <div className="list">
        {shown.map((expense) => {
        const share = shareOf(expense, person)
        const shared = toCents(share) !== toCents(expense.amount)
        return (
          <button
            type="button"
            className="list-row"
            key={expense.id}
            onClick={() => onSelect(expense)}
          >
            <span className="chip-dot" style={{ background: lookup.color(expense.category) }} aria-hidden="true" />
            <span className="list-main">
              <span className="list-title">{expense.title}</span>
              <span className="list-meta">
                <span>{formatDate(expense.date)}</span>
                <span aria-hidden="true">·</span>
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
      })}
      </div>

      {pageSize ? (
        <ShowMore rest={rest} step={pageSize} onMore={() => setLimit((n) => n + pageSize)} />
      ) : null}
    </>
  )
}
