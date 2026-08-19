/**
 * Barre impilate: come si compone la spesa, mese per mese.
 *
 * Massimo sei serie (cinque categorie più «Altre»): oltre, la leggenda diventa
 * illeggibile e i colori si assomigliano. Fra i segmenti c'è un distacco di 2px
 * del colore della superficie, non un bordo.
 */

import type { ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { monthLabel, monthLabelShort } from '../../domain/dates'
import { formatEuro, formatEuroCompact } from '../../domain/money'
import { useChartTheme } from '../../theme/theme'
import { TooltipRow, TooltipShell, asTip } from './tooltip'

export interface StackRow {
  month: string
  [seriesKey: string]: string | number
}

export interface StackSeries {
  key: string
  label: string
  color: string
}

export function StackedMonths({
  rows,
  series,
  height = 240,
}: {
  rows: readonly StackRow[]
  series: readonly StackSeries[]
  height?: number
}): ReactNode {
  const theme = useChartTheme()

  if (rows.length === 0 || series.length === 0) {
    return <p className="empty">Non c'è ancora storia da mostrare.</p>
  }

  const last = series[series.length - 1]?.key

  return (
    <div className="chart-wrap">
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows as StackRow[]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={theme.grid} vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={monthLabelShort}
              tick={{ fill: theme.muted, fontSize: 11 }}
              axisLine={{ stroke: theme.axis }}
              tickLine={false}
              minTickGap={10}
            />
            <YAxis
              tickFormatter={formatEuroCompact}
              tick={{ fill: theme.muted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={38}
            />
            {series.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId="mese"
                fill={s.color}
                stroke={theme.surface}
                strokeWidth={2}
                radius={s.key === last ? [4, 4, 0, 0] : undefined}
                isAnimationActive={false}
              />
            ))}
            <Tooltip
              wrapperStyle={{ outline: 'none' }}
              cursor={{ fill: theme.grid, fillOpacity: 0.5 }}
              content={(props) => {
                const tip = asTip(props)
                if (!tip.active || !tip.payload || tip.payload.length === 0) return null
                const month = typeof tip.label === 'string' ? tip.label : ''
                const rowsSorted = [...tip.payload]
                  .map((item) => ({
                    key: String(item.dataKey ?? ''),
                    value: item.value ?? 0,
                    color: item.color,
                  }))
                  .filter((r) => r.value > 0)
                  .sort((a, b) => b.value - a.value)
                const total = rowsSorted.reduce((acc, r) => acc + r.value, 0)
                return (
                  <TooltipShell title={monthLabel(month)}>
                    {rowsSorted.map((r) => (
                      <TooltipRow
                        key={r.key}
                        label={series.find((s) => s.key === r.key)?.label ?? r.key}
                        value={formatEuro(r.value)}
                        color={r.color}
                      />
                    ))}
                    <div style={{ borderTop: '1px solid var(--line)', marginTop: 4, paddingTop: 4 }}>
                      <TooltipRow label="Totale" value={formatEuro(total)} />
                    </div>
                  </TooltipShell>
                )
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="legend" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {series.map((s) => (
          <li className="legend-item" key={s.key}>
            <span className="legend-swatch" style={{ background: s.color }} aria-hidden="true" />
            <span className="legend-label">{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
