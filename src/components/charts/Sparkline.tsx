/** Sparkline: l'andamento accanto al numero, senza assi e senza pretese. */

import type { ReactNode } from 'react'

import { primarySeries } from '../../theme/palette'
import { useChartTheme } from '../../theme/theme'

export function Sparkline({
  values,
  width = 76,
  height = 24,
  color,
}: {
  values: readonly number[]
  width?: number
  height?: number
  color?: string
}): ReactNode {
  const theme = useChartTheme()
  if (values.length < 2) return null

  const stroke = color ?? primarySeries(theme)
  const max = Math.max(...values)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const step = width / (values.length - 1)

  const points = values.map((value, index) => {
    const x = index * step
    const y = height - 2 - ((value - min) / span) * (height - 4)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const lastPoint = points[points.length - 1]?.split(',') ?? ['0', '0']

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={lastPoint[0]}
        cy={lastPoint[1]}
        r={2.6}
        fill={stroke}
        stroke={theme.surface}
        strokeWidth={1.5}
      />
    </svg>
  )
}
