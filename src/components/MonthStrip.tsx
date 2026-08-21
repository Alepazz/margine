/**
 * Scelta del mese: una fila di schede che scorre in orizzontale.
 *
 * Prende il posto di due cose che sul telefono non funzionavano. Il menù a
 * tendina, che andando a capo si portava dietro la spinta a destra e finiva
 * schiacciato al bordo. E il tocco sul grafico dell'andamento: diciotto mesi in
 * 340px fanno diciassette pixel per mese, meno di metà polpastrello, e in più
 * cambiava valori sopra e sotto senza dire di averlo fatto.
 *
 * L'ordine è cronologico come nel grafico — il mese più recente a destra — e il
 * mese scelto si porta al centro da sé: senza, aprendo l'app si guarderebbe la
 * parte di storia sbagliata.
 *
 * Ogni scheda porta **lo scostamento dalla media**: una tacca al centro, e una
 * barretta che va a destra se quel mese è stato sopra la media, a sinistra se
 * sotto. Una barretta proporzionale al totale non diceva niente — i mesi veri
 * stanno tutti fra 1160 € e 1712 €, quindi venivano tutte piene fra l'80 e il
 * 100% — mentre lo scostamento è esattamente la domanda che si fa guardando la
 * striscia, ed è il confronto che usa già tutto il resto dell'app.
 *
 * Il mese in corso non ha barretta: è parziale, e mostrarlo «molto sotto la
 * media» sarebbe una bugia il primo di ogni mese. Al suo posto ha il punto rosso
 * che dice che sta ancora andando. E siccome «mag 26» e «mag 25» differiscono di
 * due caratteri, il cambio d'anno è marcato da una colonna con l'anno scritto
 * per il lungo.
 */

import { Fragment, useEffect, useRef, type ReactNode } from 'react'

import { monthLabel, monthLabelShort, parseMonthKey, type MonthKey } from '../domain/dates'
import { formatEuro, toCents } from '../domain/money'

export interface MonthStripItem {
  month: MonthKey
  total: number
}

export function MonthStrip({
  items,
  selected,
  current,
  average,
  onSelect,
}: {
  /** In ordine cronologico: il più recente per ultimo. */
  items: readonly MonthStripItem[]
  selected: MonthKey
  /**
   * Il mese di calendario in corso, che è ancora parziale. Arriva da fuori
   * invece di leggere l'orologio qui: un componente che sa che giorno è non si
   * può disegnare due volte uguale.
   */
  current?: MonthKey
  /** La media storica. Senza, le schede restano senza barretta. */
  average?: number
  onSelect: (month: MonthKey) => void
}): ReactNode {
  const strip = useRef<HTMLDivElement | null>(null)
  const settled = useRef(false)

  useEffect(() => {
    const chip = strip.current?.querySelector<HTMLElement>('.month-chip.is-active')
    if (!chip) return
    /*
     * `block: 'nearest'` è obbligatorio: senza, portare al centro una scheda
     * dentro un contenitore che scorre in orizzontale trascina anche la pagina
     * in verticale. Il primo posizionamento è secco, gli altri animati: una
     * scivolata all'apertura sembrerebbe un difetto.
     */
    chip.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: settled.current ? 'smooth' : 'auto',
    })
    settled.current = true
  }, [selected])

  if (items.length === 0) return null

  /** Vero per i mesi che hanno uno scostamento da mostrare. */
  const comparable = (item: MonthStripItem): boolean =>
    average !== undefined && toCents(average) > 0 && toCents(item.total) > 0 && item.month !== current

  /* La scala: il mese che si scosta di più tocca il bordo della sua metà. */
  const widest = items.reduce(
    (most, item) => (comparable(item) ? Math.max(most, Math.abs(item.total - (average ?? 0))) : most),
    0,
  )

  return (
    <div
      className="month-strip"
      ref={strip}
      role="group"
      aria-label="Mese da guardare"
    >
      {items.map((item, index) => {
        const active = item.month === selected
        const empty = toCents(item.total) === 0
        const year = parseMonthKey(item.month).year
        const previous = items[index - 1]
        /* Non davanti al primo: lì non è un confine fra due anni, è solo l'inizio. */
        const opensYear = previous !== undefined && parseMonthKey(previous.month).year !== year
        const delta = comparable(item) ? item.total - (average ?? 0) : null
        const said = empty
          ? 'nessuna spesa'
          : item.month === current
            ? 'mese in corso'
            : delta === null
              ? formatEuro(item.total, { decimals: 0 })
              : `${formatEuro(item.total, { decimals: 0 })}, ${formatEuro(Math.abs(delta), {
                  decimals: 0,
                })} ${delta >= 0 ? 'sopra' : 'sotto'} la media`
        return (
          <Fragment key={item.month}>
            {opensYear ? (
              <span className="month-strip-year" aria-hidden="true">
                {year}
              </span>
            ) : null}
            <button
              type="button"
              className={`month-chip${active ? ' is-active' : ''}`}
              aria-current={active ? 'true' : undefined}
              /*
               * Il nome per intero e il numero: `aria-label` **sostituisce** il
               * testo dentro il pulsante, quindi senza l'importo qui un lettore
               * di schermo sentirebbe solo «Giugno 2026» da una scheda che a
               * schermo porta anche 1359 €.
               */
              aria-label={`${monthLabel(item.month)}: ${said}`}
              title={`${monthLabel(item.month)} · ${said}`}
              onClick={() => onSelect(item.month)}
            >
              <span className="month-chip-name">
                {monthLabelShort(item.month)}
                {item.month === current ? (
                  <span className="month-chip-now" aria-hidden="true" />
                ) : null}
              </span>
              <span className="month-chip-total">
                {empty ? '—' : formatEuro(item.total, { decimals: 0 })}
              </span>
              <span className="month-chip-track" aria-hidden="true">
                <span className="month-chip-tick" />
                {delta === null ? null : (
                  <span
                    className={`month-chip-dev ${delta >= 0 ? 'is-over' : 'is-under'}`}
                    style={{ width: `${widest > 0 ? (Math.abs(delta) / widest) * 50 : 0}%` }}
                  />
                )}
              </span>
            </button>
          </Fragment>
        )
      })}
    </div>
  )
}
