/** Tooltip condivisi: ogni grafico ne ha uno, sempre. */

import type { ReactNode } from 'react'

export interface TipItem {
  name?: string
  value?: number
  dataKey?: string | number
  color?: string
  payload?: Record<string, unknown>
}

export interface TipProps {
  active?: boolean
  label?: unknown
  payload?: TipItem[]
}

/** Recharts passa i suoi tipi interni: qui li restringiamo a quello che usiamo. */
export function asTip(props: unknown): TipProps {
  const p = props as TipProps
  return { active: p.active, label: p.label, payload: Array.isArray(p.payload) ? p.payload : [] }
}

export function TooltipShell({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <div className="tooltip">
      <div className="tooltip-title">{title}</div>
      {children}
    </div>
  )
}

export function TooltipRow({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color?: string
}): ReactNode {
  return (
    <div className="tooltip-row">
      <span className="tooltip-row-label">
        {color ? <span className="legend-swatch" style={{ background: color }} /> : null}
        {label}
      </span>
      <span className="tooltip-value">{value}</span>
    </div>
  )
}
