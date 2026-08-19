/**
 * Torta (a ciambella) delle categorie, con la leggenda che porta sempre i valori
 * accanto: in tema chiaro alcune tinte stanno sotto il contrasto 3:1, quindi il
 * colore non deve mai essere l'unico modo di leggere il grafico.
 */

import type { ReactNode } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import { formatEuro, formatPct } from '../../domain/money'
import { useChartTheme } from '../../theme/theme'
import { TooltipRow, TooltipShell, asTip } from './tooltip'

export interface DonutSlice {
  key: string
  label: string
  value: number
  pct: number
  color: string
}

export function CategoryDonut({
  slices,
  total,
  centerCaption,
  height = 210,
}: {
  slices: readonly DonutSlice[]
  total: number
  centerCaption: string
  height?: number
}): ReactNode {
  const theme = useChartTheme()

  if (slices.length === 0) {
    return <p className="empty">Nessuna spesa in questo periodo.</p>
  }

  return (
    <div className="chart-wrap">
      <div style={{ position: 'relative', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices as DonutSlice[]}
              dataKey="value"
              nameKey="label"
              innerRadius="63%"
              outerRadius="92%"
              paddingAngle={1.2}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
              /* Il distacco di 2px fra le fette è la superficie, non un bordo colorato. */
              stroke={theme.surface}
              strokeWidth={2}
            >
              {slices.map((slice) => (
                <Cell key={slice.key} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip
              wrapperStyle={{ outline: 'none' }}
              content={(props) => {
                const tip = asTip(props)
                if (!tip.active || !tip.payload || tip.payload.length === 0) return null
                const item = tip.payload[0]
                const slice = item?.payload as unknown as DonutSlice | undefined
                if (!slice) return null
                return (
                  <TooltipShell title={slice.label}>
                    <TooltipRow label="Spesa" value={formatEuro(slice.value)} color={slice.color} />
                    <TooltipRow label="Sul totale" value={formatPct(slice.pct)} />
                  </TooltipShell>
                )
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            textAlign: 'center',
          }}
        >
          <span className="num" style={{ fontSize: '1.28rem', fontWeight: 500 }}>
            {formatEuro(total, { decimals: 0 })}
          </span>
          <span style={{ fontSize: '0.74rem', color: 'var(--ink-3)' }}>{centerCaption}</span>
        </div>
      </div>

      <ul className="legend" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {slices.map((slice) => (
          <li className="legend-item" key={slice.key}>
            <span className="legend-swatch" style={{ background: slice.color }} aria-hidden="true" />
            <span className="legend-label">{slice.label}</span>
            <span className="legend-pct">{formatPct(slice.pct)}</span>
            <span className="legend-value">{formatEuro(slice.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
