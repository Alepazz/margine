/**
 * Il numero che l'app esiste per dare: **quanto puoi ancora spendere**.
 *
 * Non «quanto è rimasto in cassa»: quello comprende l'affitto che non è ancora
 * uscito e i soldi che vuoi mettere da parte, e li fa sembrare spendibili. Qui
 * si toglie tutto ciò che è già impegnato, e si mostra il conto per intero —
 * perché un numero più piccolo di quello che ti aspetti deve poter essere
 * verificato riga per riga. → ADR-0015
 *
 * La barra è il **mese intero**: entrate da un capo all'altro, e dentro, in
 * fila, i soldi nell'ordine in cui smettono di essere tuoi — risparmio, fisse
 * arrivate, fisse ancora attese (tratteggiate), variabili spese, e in coda ciò
 * che resta. Prima era un rapporto contro il solo fondo discrezionale, e
 * risparmio e fisse non ci stavano dentro per costruzione: l'affitto sembrava
 * arrivare dal nulla il giorno che lo si registrava. → ADR-0057
 *
 * Accanto al numero grande c'è il saldo con l'altra persona, che è una
 * grandezza **diversa** e non entra in nessuno di questi conti: le spese
 * contano già solo la propria quota. → ADR-0058, ADR-0019
 *
 * Con i guadagni oscurati i campi segreti arrivano già a `null` da
 * `marginView()`: qui non c'è nessun numero da velare, e la barra diventa
 * neutra perché un riempimento parziale **è** la quota spesa.
 */

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { monthLabel, type MonthKey } from '../domain/dates'
import { marginBar, type MarginSegmentKey, type MarginView } from '../domain/income'
import { formatEuro, toCents } from '../domain/money'
import type { Projection } from '../domain/selectors'
import { aTo } from '../domain/text'
import { StatusChip, VEIL } from './ui'

/** Un valore in euro, o i pallini se è coperto. */
function Money({ value, whole = false }: { value: number | null; whole?: boolean }): ReactNode {
  if (value === null) return <>{VEIL}</>
  return <>{formatEuro(value, whole ? { decimals: 0 } : {})}</>
}

/**
 * Una riga del conto, col pallino del segmento a cui corrisponde nella barra.
 *
 * Il pallino **è** la legenda: mettere sotto la barra un elenco di colori
 * duplicherebbe queste stesse righe, che i numeri li portano già. Chi guarda un
 * pezzo di barra e vuole sapere quanto vale scende con l'occhio e lo trova.
 */
function Row({
  label,
  value,
  sub,
  dot,
}: {
  label: string
  value: ReactNode
  sub?: string
  dot?: string
}): ReactNode {
  return (
    <div className="kv-row">
      <dt>
        {dot ? <span className={`kv-dot ${dot}`} aria-hidden="true" /> : null}
        {label}
        {sub ? <span className="kv-tag">{sub}</span> : null}
      </dt>
      <dd className="num">{value}</dd>
    </div>
  )
}

/**
 * Il saldo con l'altra persona: **la seconda metà della testata**.
 *
 * Non è un'appendice del numero grande, è l'altra faccia della stessa domanda —
 * «quanto posso spendere» e «come stiamo io e lei». Per questo le due colonne
 * sono uguali, divise da un filo, e non una grande e una piccola appoggiata a
 * destra: quella forma le faceva sembrare due cose scollegate ai due estremi di
 * una scheda vuota in mezzo. → ADR-0060
 *
 * Il titolo è **fisso** e dice cosa è il numero. «Con Federica» era un contesto,
 * non un titolo: non diceva che quello fosse un saldo.
 *
 * Il **segno è il verso**: `+` verde vuol dire che rientrano soldi, `−` rosso
 * che ne escono. La cifra è più piccola di quella del margine, che resta il
 * numero per cui l'app esiste. → ADR-0015
 */
function BalanceTag({
  owedToMe,
  otherName,
  onSettle,
}: {
  owedToMe: number
  otherName: string
  onSettle: () => void
}): ReactNode {
  const cents = toCents(owedToMe)
  const tono = cents > 0 ? 'is-good' : cents < 0 ? 'is-bad' : 'is-even'
  const cifra = formatEuro(Math.abs(owedToMe), { decimals: 0 })
  /* Il segno non si legge ad alta voce: la frase la porta il nome accessibile. */
  const frase =
    cents > 0
      ? `${otherName} ti deve ${cifra}`
      : cents < 0
        ? `Devi ${cifra} ${aTo(otherName)} ${otherName}`
        : `In pari con ${otherName}`

  return (
    <div className="hero hero-balance">
      <span className="hero-label">Il vostro saldo</span>
      <Link to="/saldo" className="hero-balance-link" aria-label={`${frase}. Vai al saldo`}>
        <span className={`hero-balance-value ${tono}`} aria-hidden="true">
          {cents === 0 ? 'Pari' : `${cents > 0 ? '+' : '−'}${cifra}`}
        </span>
      </Link>
      {/*
        Chiudere il conto da qui, con le stesse parole della pagina Saldo: è il
        gesto che si fa **guardando** il saldo, e mandarlo in un'altra pagina
        costava due tocchi ogni volta. Compare nei due versi, come là: se lei ti
        ha pagato, il rimborso va da lei a te. → ADR-0060, ADR-0019
      */}
      {cents === 0 ? null : (
        <button type="button" className="btn btn-sm hero-balance-btn" onClick={onSettle}>
          Saldato tutto ({cifra})
        </button>
      )}
    </div>
  )
}

export function MarginMeter({
  view,
  projection,
  lastYear,
  balance,
  onToggleHidden,
}: {
  view: MarginView
  projection: Projection
  /** Lo stesso mese dell'anno prima: unico riferimento stagionale che i dati permettono. */
  lastYear: { month: MonthKey; total: number } | null
  /** Il saldo con l'altra persona, già girato dal punto di vista di chi guarda. */
  balance: { owedToMe: number; otherName: string; onSettle: () => void } | null
  onToggleHidden: () => void
}): ReactNode {
  const hidden = view.income === null

  if (!view.known) {
    /*
     * Senza profilo entrate il margine non si può calcolare, ma **il saldo sì**:
     * non dipende dalle entrate, dipende da chi ha anticipato cosa. Nella prima
     * versione questo ramo tornava la sola colonna di sinistra e portava via
     * anche il saldo — visto sul banco nella vista di chi non ha compilato il
     * profilo, che è poi la situazione di chi apre l'app per la prima volta.
     */
    return (
      <div className="hero-row">
        <div className="hero">
          <span className="hero-label">Puoi ancora spendere</span>
          <span className="hero-value is-sconosciuto">—</span>
          <span className="hero-hint">
            Il profilo entrate non è ancora impostato: hai speso{' '}
            <strong>{formatEuro(view.spent)}</strong>. Compila le entrate nelle impostazioni per
            sapere quanto ti resta.
          </span>
        </div>
        {balance ? <BalanceTag {...balance} /> : null}
      </div>
    )
  }

  const stillOpen = projection.method === 'stimato'
  const bar = marginBar(view, {
    projectedVariable: stillOpen ? projection.projectedVariable : null,
  })
  /* I pallini sono la legenda **della barra**: senza barra non indicano niente,
     e una legenda che rimanda al nulla è solo rumore. Prendono la tinta dalla
     stessa funzione dei segmenti, così «le variabili seguono il semaforo» resta
     scritto una volta sola — e una chiave sbagliata non compila. */
  const dot = (key: MarginSegmentKey): string | undefined =>
    bar === null ? undefined : segmentTint(key, view.status)

  return (
    <div className="stack" style={{ gap: 12 }}>
      {/*
        Due colonne, non una riga che avvolge: la griglia le tiene affiancate a
        ogni larghezza, e `minmax(0, 1fr)` sulla prima le impedisce di allargarsi
        al suo contenuto — il suggerimento «[cifra rimossa] al giorno da qui a fine mese»
        ha un min-content largo, e in flex bastava a spingere il saldo a capo.
        → ADR-0059, ADR-0044
      */}
      <div className="hero-row">
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
        {balance ? <BalanceTag {...balance} /> : null}
      </div>

      {/* Il semaforo è un commento alla barra, non al numero: sta appena sopra
          di essa, dove serve a leggerla. Dentro una `.row` perché figlio diretto
          di una colonna flex si stirerebbe a tutta larghezza. */}
      <div className="row">
        <StatusChip status={view.status} />
      </div>

      <div className="meter">
        <div
          className="meter-track"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={bar?.total ?? undefined}
          aria-valuenow={bar?.committed}
          aria-label={
            bar === null
              ? 'Quota delle entrate del mese già impegnata, nascosta'
              : 'Quota delle entrate del mese già impegnata'
          }
        >
          {bar === null ? (
            /* Neutra e piena: le proporzioni **sono** i numeri, e a guadagni
               oscurati `marginBar` non compone niente proprio per questo. */
            <div className="meter-fill is-hidden" style={{ width: '100%' }} />
          ) : (
            <>
              {bar.segments.map((segment) => (
                <div
                  key={segment.key}
                  className={`meter-seg ${segmentTint(segment.key, view.status)}`}
                  style={{ width: `${String(segment.pct)}%` }}
                />
              ))}
              {bar.projectionPct !== null ? (
                <div
                  className="meter-projection"
                  /* `clamp` perché la traccia taglia ciò che sborda: a ritmo da
                     sforamento la tacca finiva **fuori** dal bordo e spariva,
                     proprio nel mese in cui serve vederla. */
                  style={{
                    left: `clamp(0px, calc(${String(bar.projectionPct)}% - 1px), calc(100% - 2px))`,
                  }}
                  title={`A questo ritmo chiudi il mese a ${formatEuro(projection.projected)}`}
                />
              ) : null}
            </>
          )}
        </div>
        <p className="meter-note">
          {view.fixedStillDue > 0 ? (
            <>
              Il tratteggio sono{' '}
              <strong>{formatEuro(view.fixedStillDue, { decimals: 0 })}</strong> di fisse che devono
              ancora arrivare — affitto, bollette, abbonamenti. Sono già tolte dal numero grande:
              quando le registri, il tratteggio diventa pieno e lo spendibile non si muove.
            </>
          ) : (
            'Tutte le fisse attese del mese sono già arrivate.'
          )}
        </p>
      </div>

      {/* Il conto per intero: il numero grande è più piccolo di quello che ti
          aspetti, e deve poter essere verificato una riga alla volta. */}
      <dl className="kv">
        <Row label="Entrate del mese" value={<Money value={view.income} />} />
        <Row
          label="Da mettere da parte"
          dot={dot('risparmio')}
          value={<>− <Money value={view.savingsTarget} /></>}
        />
        <Row
          label="Spese fisse attese"
          dot={dot('fisse')}
          sub={
            view.fixedStillDue > 0
              ? `di cui ${formatEuro(view.fixedStillDue, { decimals: 0 })} non ancora arrivate`
              : 'tutte già addebitate'
          }
          value={<>− {formatEuro(view.expectedFixed)}</>}
        />
        <Row
          label="Variabili già spese"
          dot={dot('variabili')}
          value={<>− {formatEuro(view.variableSpent)}</>}
        />
        <Row label="Puoi ancora spendere" dot={dot('resto')} value={<Money value={view.spendable} />} />
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

/**
 * I modificatori di un segmento, per la barra e per il pallino della sua riga.
 *
 * Solo le variabili prendono la tinta del semaforo: sono la parte su cui si può
 * ancora incidere, e l'unica il cui colore deve poter cambiare guardandola. Una
 * funzione sola per tutti e due i posti, perché sono la stessa decisione e
 * scriverla due volte vuol dire vederle divergere.
 */
function segmentTint(key: MarginSegmentKey, status: MarginView['status']): string {
  return key === 'variabili' ? `is-variabili is-${status}` : `is-${key}`
}
