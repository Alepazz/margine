/**
 * Barre orizzontali in HTML: il confronto preciso che la torta non dà, e
 * insieme la vista tabellare che rende leggibile il grafico anche a chi non
 * distingue le tinte.
 */

import type { ReactNode } from 'react'

import { formatEuro } from '../../domain/money'
import { useChartTheme } from '../../theme/theme'

export interface BarItem {
  key: string
  label: string
  value: number
  color?: string
  sub?: string
}

export function BarList({
  items,
  max,
  formatValue = (value: number) => formatEuro(value),
}: {
  items: readonly BarItem[]
  max?: number
  formatValue?: (value: number) => string
}): ReactNode {
  const theme = useChartTheme()

  if (items.length === 0) return <p className="empty">Niente da confrontare.</p>

  const ceiling = max ?? Math.max(...items.map((i) => i.value), 0)

  return (
    <div className="bars">
      {items.map((item) => {
        const width = ceiling > 0 ? Math.max(2, (item.value / ceiling) * 100) : 0
        return (
          <div className="bar-row" key={item.key}>
            <span className="bar-label" title={item.label}>
              {item.color ? (
                <span className="legend-swatch" style={{ background: item.color }} aria-hidden="true" />
              ) : null}
              {item.label}
            </span>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: `${width}%`, background: item.color ?? theme.seq[4] }}
              />
            </div>
            <span className="bar-value">
              {formatValue(item.value)}
              {item.sub ? <span className="list-amount-sub"> {item.sub}</span> : null}
            </span>
          </div>
        )
      })}
    </div>
  )
}
