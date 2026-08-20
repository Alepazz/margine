/** Pezzi elementari dell'interfaccia: schede, numeri, etichette, avvisi. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react'

import { formatPct } from '../domain/money'
import type { MarginStatus } from '../domain/income'

/**
 * Il segno al posto di un numero coperto. Sta qui, e non in due posti, perché i
 * luoghi che oscurano i guadagni sono due — la scheda del margine e il profilo
 * entrate — e devono coprire allo stesso modo. → ADR-0016
 */
export const VEIL = '••••'

// ─────────────────────────── scheda ───────────────────────────

export function Card({
  title,
  note,
  action,
  children,
  /* Classi di **comportamento**, non di stile: `scroll-target` dice che qualcuno
     ci arriva scorrendo, non come è dipinta la scheda. I colori restano nei
     token, come sempre. */
  className,
  ref,
}: {
  title?: string
  note?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  ref?: Ref<HTMLElement>
}): ReactNode {
  return (
    <section className={className ? `card ${className}` : 'card'} ref={ref}>
      {title || action || note ? (
        <div className="card-head">
          <div>
            {title ? <h2 className="card-title">{title}</h2> : null}
            {note ? <p className="card-note">{note}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  )
}

// ─────────────────────────── numeri ───────────────────────────

export function StatTile({
  label,
  value,
  hint,
  delta,
  aside,
  /** Per i valori che non sono importi (una data, un testo): stanno su una riga. */
  smallValue = false,
}: {
  label: string
  value: string
  hint?: string
  delta?: ReactNode
  aside?: ReactNode
  smallValue?: boolean
}): ReactNode {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div className={`stat-value${smallValue ? ' is-small' : ''}`}>{value}</div>
          {hint ? <div className="stat-hint">{hint}</div> : null}
          {delta}
        </div>
        {aside}
      </div>
    </div>
  )
}

/**
 * Variazione con segno, freccia e parola: per una spesa «più» è una cattiva
 * notizia, quindi il verso buono è di default verso il basso.
 */
export function DeltaLabel({
  change,
  goodWhen = 'down',
  suffix,
}: {
  change: number | null
  goodWhen?: 'down' | 'up'
  suffix?: string
}): ReactNode {
  if (change === null) return <span className="delta is-neutral">— nessun confronto</span>
  const rounded = Math.abs(change) < 0.005 ? 0 : change
  if (rounded === 0) {
    return <span className="delta is-neutral">= in linea{suffix ? ` ${suffix}` : ''}</span>
  }
  const up = rounded > 0
  const good = goodWhen === 'down' ? !up : up
  return (
    <span className={`delta ${good ? 'is-good' : 'is-bad'}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      {up ? '+' : '−'}
      {formatPct(Math.abs(rounded))}
      {suffix ? ` ${suffix}` : ''}
    </span>
  )
}

/**
 * Il piede di un elenco con un tetto: «Mostra altre 12 (di 46 rimaste)».
 *
 * Sta qui e non in ogni pagina perché è la stessa cosa ovunque — un elenco
 * troncato che si allunga di una pagina — e perché una pagina che stampa
 * quattromila pixel di righe non si scorre col pollice.
 */
export function ShowMore({
  rest,
  step,
  onMore,
  /* «altre … rimaste» per le spese, «altri … rimasti» per i movimenti: in
     italiano il genere cambia due parole, quindi lo dice chi chiama. */
  gender = 'f',
}: {
  rest: number
  step: number
  onMore: () => void
  gender?: 'f' | 'm'
}): ReactNode {
  if (rest <= 0) return null
  const altri = gender === 'f' ? 'altre' : 'altri'
  const rimasti = gender === 'f' ? 'rimaste' : 'rimasti'
  return (
    <div className="card-foot" style={{ textAlign: 'center' }}>
      <button type="button" className="btn btn-sm" onClick={onMore}>
        Mostra {altri} {Math.min(step, rest)} (di {rest} {rimasti})
      </button>
    </div>
  )
}

// ─────────────────────────── etichette ───────────────────────────

export function Chip({
  children,
  tone,
  dotColor,
}: {
  children: ReactNode
  tone?: 'ok' | 'attenzione' | 'oltre' | 'tax'
  dotColor?: string
}): ReactNode {
  return (
    <span className={`chip${tone ? ` is-${tone}` : ''}`}>
      {dotColor ? <span className="chip-dot" style={{ background: dotColor }} aria-hidden="true" /> : null}
      {children}
    </span>
  )
}

const STATUS_TEXT: Record<MarginStatus, { glyph: string; label: string; tone?: 'ok' | 'attenzione' | 'oltre' }> = {
  ok: { glyph: '✓', label: 'Sotto controllo', tone: 'ok' },
  attenzione: { glyph: '!', label: 'Da tenere d’occhio', tone: 'attenzione' },
  oltre: { glyph: '×', label: 'Oltre le entrate', tone: 'oltre' },
  sconosciuto: { glyph: '?', label: 'Entrate non impostate' },
}

/** Il colore non porta mai il significato da solo: c'è sempre glifo + parola. */
export function StatusChip({ status }: { status: MarginStatus }): ReactNode {
  const { glyph, label, tone } = STATUS_TEXT[status]
  return (
    <Chip tone={tone}>
      <span aria-hidden="true">{glyph}</span>
      {label}
    </Chip>
  )
}

// ─────────────────────────── avvisi e vuoti ───────────────────────────

export function Notice({
  tone = 'info',
  icon,
  children,
}: {
  tone?: 'info' | 'warn' | 'bad'
  icon?: string
  children: ReactNode
}): ReactNode {
  const cls = tone === 'info' ? 'notice' : `notice is-${tone}`
  return (
    <div className={cls}>
      <span className="notice-icon" aria-hidden="true">
        {icon ?? (tone === 'bad' ? '×' : tone === 'warn' ? '!' : 'i')}
      </span>
      <div>{children}</div>
    </div>
  )
}

// ─────────────────────────── controlli ───────────────────────────

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  title?: string
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
}): ReactNode {
  /* Da quattro voci in su l'imbottitura piena sborda dai 390px del telefono. */
  const tight = options.length >= 4

  return (
    <div className={`segmented${tight ? ' is-tight' : ''}`} role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="segmented-option"
          aria-pressed={option.value === value}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────── toast ───────────────────────────

interface ToastApi {
  show: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }): ReactNode {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const show = useCallback((next: string) => {
    setMessage(next)
    if (timer.current !== undefined) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMessage(null), 2600)
  }, [])

  useEffect(
    () => () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current)
    },
    [],
  )

  const api = useMemo<ToastApi>(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      {message ? (
        <div className="toast" role="status" aria-live="polite">
          {message}
        </div>
      ) : null}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  return ctx ?? { show: () => undefined }
}
