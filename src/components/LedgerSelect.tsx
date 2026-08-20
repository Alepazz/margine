/**
 * Il selettore del tricount: una scelta sola.
 *
 * Su Tricount i gruppi sono una lista piatta e ogni vacanza è un gruppo come gli
 * altri. Prima qui c'erano due tendine — «in quale registro», e poi «quale
 * viaggio» — che sono due domande dove nella testa di chi inserisce ce n'è una.
 * → ADR-0026
 *
 * Le vacanze concluse non compaiono, tranne quella della spesa che si sta
 * correggendo: un menù che non contiene il valore corrente lo cambierebbe da sé.
 */

import type { ReactNode } from 'react'

import { ledgerOptions } from '../domain/expense-rules'
import { sourceTitleOf, tripTitleOf, type Source, type SourceMap, type Trip } from '../domain/types'

export function LedgerSelect({
  id,
  value,
  trips,
  sources,
  onChange,
  ariaLabel = 'Tricount',
}: {
  id?: string
  value: string
  trips: readonly Trip[]
  sources: SourceMap | undefined
  onChange: (key: string) => void
  ariaLabel?: string
}): ReactNode {
  const options = ledgerOptions(trips, { current: value })
  const fixed = options.filter((option) => option.trip === undefined)
  const vacations = options.filter((option) => option.trip !== undefined)

  return (
    <select
      id={id}
      className="select"
      value={value}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
    >
      {fixed.map((option) => (
        <option key={option.key} value={option.key}>
          {sourceTitleOf(sources, option.key as Source)}
        </option>
      ))}
      {vacations.length > 0 ? (
        <optgroup label={sourceTitleOf(sources, 'vacanze')}>
          {vacations.map((option) => (
            <option key={option.key} value={option.key}>
              {option.trip ? tripTitleOf(option.trip) : option.key} {option.trip?.year}
              {option.closed ? ' (conclusa)' : ''}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  )
}
