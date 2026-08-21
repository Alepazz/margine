/**
 * Il selettore del tricount: una scelta sola, **fra i propri**.
 *
 * Su Tricount i gruppi sono una lista piatta e ogni vacanza è un gruppo come gli
 * altri: qui è uguale. → ADR-0026
 *
 * Il menù mostra solo i tricount di cui chi guarda è membro: il compartimento
 * personale dell'altra persona non compare, quindi metterci una spesa per
 * errore non è vietato — è impossibile. → ADR-0037
 *
 * I tricount conclusi non compaiono, tranne quello della spesa che si sta
 * correggendo: un menù che non contiene il valore corrente lo cambierebbe da sé.
 */

import type { ReactNode } from 'react'

import { tricountOptions } from '../domain/expense-rules'
import { tricountTitleOf, type PersonId, type Tricount } from '../domain/types'

export function LedgerSelect({
  id,
  value,
  tricounts,
  person,
  onChange,
  ariaLabel = 'Tricount',
}: {
  id?: string
  value: string
  tricounts: readonly Tricount[]
  /** Chi sta inserendo: il menù offre solo i suoi tricount. */
  person: PersonId
  onChange: (key: string) => void
  ariaLabel?: string
}): ReactNode {
  const options = tricountOptions(tricounts, person, { current: value })
  const plain = options.filter((option) => option.tricount.trip === undefined)
  const vacations = options.filter((option) => option.tricount.trip !== undefined)

  return (
    <select
      id={id}
      className="select"
      value={value}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
    >
      {plain.map((option) => (
        <option key={option.tricount.id} value={option.tricount.id}>
          {tricountTitleOf(option.tricount)}
        </option>
      ))}
      {vacations.length > 0 ? (
        <optgroup label="Vacanze">
          {vacations.map((option) => (
            <option key={option.tricount.id} value={option.tricount.id}>
              {tricountTitleOf(option.tricount)} {option.tricount.trip?.year}
              {option.closed ? ' (concluso)' : ''}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  )
}
