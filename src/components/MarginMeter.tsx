/**
 * Il numero che l'app esiste per dare: **quanto puoi ancora spendere**.
 *
 * Non «quanto è rimasto in cassa»: quello comprende l'affitto che non è ancora
 * uscito e i soldi che vuoi mettere da parte, e li fa sembrare spendibili. Qui
 * si toglie tutto ciò che è già impegnato, e si mostra il conto per intero —
 * perché un numero più piccolo di quello che ti aspetti deve poter essere
 * verificato riga per riga. → ADR-0015
 *
 * Il misuratore è un rapporto contro un limite, e il limite è il fondo
 * discrezionale del mese, non le entrate: barra piena = variabili già spese,
 * tacca = dove arrivi a questo ritmo.
 *
 * Con i guadagni oscurati i campi segreti arrivano già a `null` da
 * `marginView()`: qui non c'è nessun numero da velare, e la barra diventa
 * neutra perché un riempimento parziale **è** la quota spesa.
 */

import type { ReactNode } from 'react'

import { monthLabel, type MonthKey } from '../domain/dates'
import type { MarginView } from '../domain/income'
import { formatEuro } from '../domain/money'
import type { Projection } from '../domain/selectors'
import { StatusChip, VEIL } from './ui'

/** Un valore in euro, o i pallini se è coperto. */
function Money({ value, whole = false }: { value: number | null; whole?: boolean }): ReactNode {
  if (value === null) return <>{VEIL}</>
  return <>{formatEuro(value, whole ? { decimals: 0 } : {})}</>
}

function Row({ label, value, sub }: { label: string; value: ReactNode; sub?: string }): ReactNode {
  return (
    <div className="kv-row">
      <dt>
        {label}
        {sub ? <span className="kv-tag">{sub}</span> : null}
      </dt>
      <dd className="num">{value}</dd>
    </div>
  )
}

export function MarginMeter({
  view,
  projection,
  lastYear,
  onToggleHidden,
}: {
  view: MarginView
  projection: Projection
  /** Lo stesso mese dell'anno prima: unico riferimento stagionale che i dati permettono. */
  lastYear: { month: MonthKey; total: number } | null
  onToggleHidden: () => void
}): ReactNode {
  const hidden = view.income === null

  if (!view.known) {
    return (
      <div className="hero">
        <span className="hero-label">Puoi ancora spendere</span>
        <span className="hero-value is-sconosciuto">—</span>
        <span className="hero-hint">
          Il profilo entrate non è ancora impostato: hai speso{' '}
          <strong>{formatEuro(view.spent)}</strong>. Compila le entrate nelle impostazioni per
          sapere quanto ti resta.
        </span>
      </div>
    )
  }

  const budget = view.discretionaryBudget
  const pct = (part: number): number | null =>
    budget === null || budget <= 0 ? null : Math.min(100, Math.max(0, (part / budget) * 100))
  const fillPct = pct(view.variableSpent)
  const projectionPct = pct(projection.projectedVariable)
  const stillOpen = projection.method === 'stimato'

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="hero">
          <span className="hero-label">Puoi ancora spendere</span>
          {/*
            Il numero stesso è il comando: si tocca dov'è già l'occhio, e la
            testata non deve trovare posto per una quarta icona.
          */}
          <button
            type="button"
            className={`hero-value is-${view.status}`}
            onClick={onToggleHidden}
            aria-pressed={hidden}
            title={hidden ? 'Mostra i guadagni' : 'Nascondi i guadagni'}
          >
            <Money value={view.spendable} whole />
            <span className="sr-only">
              {hidden ? ' — tocca per mostrare i guadagni' : ' — tocca per nascondere i guadagni'}
            </span>
          </button>
          <span className="hero-hint">
            {stillOpen ? (
              /* «per i 11 giorni» è sbagliato in italiano e «per gli 8» lo è per gli
                 altri numeri: la frase evita l'articolo invece di indovinarlo. */
              <>
                <Money value={view.spendablePerDay} whole /> al giorno da qui a fine mese (
                {Math.max(0, projection.totalDays - projection.elapsedDays)} giorni)
              </>
            ) : (
              'Mese chiuso: il numero è definitivo.'
            )}
          </span>
        </div>
        <StatusChip status={view.status} />
      </div>

      <div className="meter">
        <div
          className="meter-track"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={budget ?? undefined}
          aria-valuenow={hidden ? undefined : view.variableSpent}
          aria-label={
            hidden
              ? 'Quota del fondo del mese già spesa, nascosta'
              : 'Quota del fondo del mese già spesa'
          }
        >
          {hidden ? (
            /* Neutra e piena: un riempimento parziale racconterebbe la percentuale. */
            <div className="meter-fill is-hidden" style={{ width: '100%' }} />
          ) : (
            <>
              <div className={`meter-fill is-${view.status}`} style={{ width: `${fillPct ?? 0}%` }} />
              {stillOpen && projectionPct !== null ? (
                <div
                  className="meter-projection"
                  style={{ left: `calc(${projectionPct}% - 1px)` }}
                  title={`A questo ritmo spendi ${formatEuro(projection.projectedVariable)} di variabili`}
                />
              ) : null}
            </>
          )}
        </div>
        <div className="meter-scale">
          <span>{formatEuro(view.variableSpent, { decimals: 0 })} di variabili</span>
          <span>
            <Money value={budget} whole /> il fondo del mese
          </span>
        </div>
      </div>

      {/* Il conto per intero: il numero grande è più piccolo di quello che ti
          aspetti, e deve poter essere verificato una riga alla volta. */}
      <dl className="kv">
        <Row label="Entrate del mese" value={<Money value={view.income} />} />
        <Row
          label="Da mettere da parte"
          value={<>− <Money value={view.savingsTarget} /></>}
        />
        <Row
          label="Spese fisse attese"
          sub={
            view.fixedStillDue > 0
              ? `di cui ${formatEuro(view.fixedStillDue, { decimals: 0 })} non ancora arrivate`
              : 'tutte già addebitate'
          }
          value={<>− {formatEuro(view.expectedFixed)}</>}
        />
        <Row label="Variabili già spese" value={<>− {formatEuro(view.variableSpent)}</>} />
        <Row label="Puoi ancora spendere" value={<Money value={view.spendable} />} />
      </dl>

      <div className="stack" style={{ gap: 4, fontSize: '0.88rem', color: 'var(--ink-2)' }}>
        {stillOpen ? (
          <p>
            A questo ritmo chiudi il mese a{' '}
            <strong>{formatEuro(view.projectedSpent, { decimals: 0 })}</strong> di spesa (
            {projection.elapsedDays} giorni su {projection.totalDays}).
          </p>
        ) : null}
        {lastYear ? (
          <p>
            Nello stesso mese dell'anno prima — {monthLabel(lastYear.month)} — hai speso{' '}
            <strong>{formatEuro(lastYear.total, { decimals: 0 })}</strong>.
          </p>
        ) : null}
        {view.margin !== null && view.fixedStillDue > 0 ? (
          <p>
            In cassa restano {formatEuro(view.margin, { decimals: 0 })}, ma{' '}
            {formatEuro(view.fixedStillDue + (view.savingsTarget ?? 0), { decimals: 0 })} sono già
            impegnati fra fisse in arrivo e risparmio.
          </p>
        ) : null}
      </div>
    </div>
  )
}
