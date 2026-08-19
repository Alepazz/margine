/**
 * Andamento mensile: una serie sola, quindi nessuna leggenda (il titolo la
 * nomina) e la media storica come linea di riferimento. Il mese selezionato è
 * marcato per enfasi, e cliccando un mese lo si seleziona.
 */

import type { ReactNode } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { monthLabel, monthLabelShort, type MonthKey } from '../../domain/dates'
import { formatEuro, formatEuroCompact, formatPct, relativeChange } from '../../domain/money'
import { primarySeries, type ChartTheme } from '../../theme/palette'
import { useChartTheme } from '../../theme/theme'
import { TooltipRow, TooltipShell, asTip } from './tooltip'

export interface TrendPoint {
  month: MonthKey
  value: number
}

export function TrendChart({
  points,
  average,
  highlightMonth,
  height = 210,
  onSelectMonth,
}: {
  points: readonly TrendPoint[]
  average?: number
  highlightMonth?: MonthKey
  height?: number
  onSelectMonth?: (month: MonthKey) => void
}): ReactNode {
  const theme = useChartTheme()

  if (points.length === 0) {
    return <p className="empty">Non c'è ancora storia da mostrare.</p>
  }

  const line = primarySeries(theme)
  const highlighted = points.find((p) => p.month === highlightMonth)

  return (
    <div className="chart-wrap" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={points as TrendPoint[]}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          onClick={(state: unknown) => {
            if (!onSelectMonth) return
            const label = (state as { activeLabel?: unknown } | null)?.activeLabel
            if (typeof label === 'string') onSelectMonth(label)
          }}
        >
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={line} stopOpacity={0.22} />
              <stop offset="100%" stopColor={line} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={theme.grid} strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={monthLabelShort}
            tick={{ fill: theme.muted, fontSize: 11 }}
            axisLine={{ stroke: theme.axis }}
            tickLine={false}
            minTickGap={14}
          />
          <YAxis
            tickFormatter={formatEuroCompact}
            tick={{ fill: theme.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={38}
          />
          {average !== undefined && average > 0 ? (
            <ReferenceLine
              y={average}
              stroke={theme.muted}
              strokeDasharray="4 4"
              label={{
                value: `media ${formatEuro(average, { decimals: 0 })}`,
                position: 'insideTopRight',
                fill: theme.muted,
                fontSize: 11,
              }}
            />
          ) : null}
          <Area
            type="monotone"
            dataKey="value"
            stroke={line}
            strokeWidth={2}
            fill="url(#trend-fill)"
            dot={false}
            activeDot={{ r: 4, fill: line, stroke: theme.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
          {highlighted ? (
            <ReferenceDot
              x={highlighted.month}
              y={highlighted.value}
              r={4.5}
              fill={theme.ink}
              stroke={theme.surface}
              strokeWidth={2}
            />
          ) : null}
          <Tooltip
            wrapperStyle={{ outline: 'none' }}
            cursor={{ stroke: theme.axis, strokeWidth: 1 }}
            content={(props) => renderTip(props, average, theme)}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function renderTip(props: unknown, average: number | undefined, theme: ChartTheme): ReactNode {
  const tip = asTip(props)
  if (!tip.active || !tip.payload || tip.payload.length === 0) return null
  const value = tip.payload[0]?.value ?? 0
  const month = typeof tip.label === 'string' ? tip.label : ''
  const change = average === undefined ? null : relativeChange(value, average)
  return (
    <TooltipShell title={monthLabel(month)}>
      <TooltipRow label="Spesa" value={formatEuro(value)} color={primarySeries(theme)} />
      {change !== null ? (
        <TooltipRow
          label="Sulla media"
          value={`${change > 0 ? '+' : ''}${formatPct(change)}`}
        />
      ) : null}
    </TooltipShell>
  )
}
