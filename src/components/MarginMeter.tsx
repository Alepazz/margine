/**
 * Il numero che l'app esiste per dare: quanto margine resta questo mese.
 *
 * Il misuratore è un rapporto contro un limite (le entrate), non una torta a due
 * fette: barra piena = speso, tacca nera = dove arrivi a questo ritmo.
 */

import type { ReactNode } from 'react'

import { dailyAllowance, type MarginResult } from '../domain/income'
import { formatEuro, formatPct } from '../domain/money'
import type { Projection } from '../domain/selectors'
import { StatusChip } from './ui'

export function MarginMeter({
  result,
  projection,
}: {
  result: MarginResult
  projection: Projection
}): ReactNode {
  if (!result.known) {
    return (
      <div className="hero">
        <span className="hero-label">Margine del mese</span>
        <span className="hero-value is-sconosciuto">—</span>
        <span className="hero-hint">
          Il profilo entrate non è ancora impostato: hai speso{' '}
          <strong>{formatEuro(result.spent)}</strong>. Compila le entrate nelle impostazioni per
          vedere il margine.
        </span>
      </div>
    )
  }

  const fillPct = Math.min(100, Math.max(0, result.usedPct * 100))
  const projectionPct = Math.min(100, Math.max(0, (result.projectedSpent / result.income) * 100))
  const perDay = dailyAllowance(result, projection)

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="hero">
          <span className="hero-label">Margine residuo</span>
          <span className={`hero-value is-${result.status}`}>{formatEuro(result.margin, { decimals: 0 })}</span>
          <span className="hero-hint">
            su {formatEuro(result.income, { decimals: 0 })} di entrate · speso{' '}
            {formatEuro(result.spent, { decimals: 0 })} ({formatPct(result.usedPct)})
          </span>
        </div>
        <StatusChip status={result.status} />
      </div>

      <div className="meter">
        <div
          className="meter-track"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={result.income}
          aria-valuenow={result.spent}
          aria-label="Quota di entrate già spesa"
        >
          <div className={`meter-fill is-${result.status}`} style={{ width: `${fillPct}%` }} />
          {projection.method === 'stimato' ? (
            <div
              className="meter-projection"
              style={{ left: `calc(${projectionPct}% - 1px)` }}
              title={`Proiezione a fine mese: ${formatEuro(result.projectedSpent)}`}
            />
          ) : null}
        </div>
        <div className="meter-scale">
          <span>{formatEuro(result.spent, { decimals: 0 })} spesi</span>
          <span>{formatEuro(result.income, { decimals: 0 })} entrate</span>
        </div>
      </div>

      <div className="stack" style={{ gap: 4, fontSize: '0.88rem', color: 'var(--ink-2)' }}>
        {projection.method === 'stimato' ? (
          <p>
            A questo ritmo chiudi il mese a <strong>{formatEuro(result.projectedSpent, { decimals: 0 })}</strong>{' '}
            ({projection.elapsedDays} giorni su {projection.totalDays}), con un margine di{' '}
            <strong>{formatEuro(result.projectedMargin, { decimals: 0 })}</strong>.
          </p>
        ) : (
          <p>Mese chiuso: il numero è definitivo.</p>
        )}
        {result.savingsTarget > 0 ? (
          <p>
            Al netto dei {formatEuro(result.savingsTarget, { decimals: 0 })} da mettere da parte, ti
            restano <strong>{formatEuro(result.marginAfterSavings, { decimals: 0 })}</strong>
            {projection.method === 'stimato' && perDay > 0
              ? ` — circa ${formatEuro(perDay, { decimals: 0 })} al giorno da qui a fine mese.`
              : '.'}
          </p>
        ) : null}
      </div>
    </div>
  )
}
