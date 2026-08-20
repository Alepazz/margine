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
 */

import { useEffect, useRef, type ReactNode } from 'react'

import { monthLabel, monthLabelShort, type MonthKey } from '../domain/dates'
import { formatEuro, toCents } from '../domain/money'

export interface MonthStripItem {
  month: MonthKey
  total: number
}

export function MonthStrip({
  items,
  selected,
  onSelect,
}: {
  /** In ordine cronologico: il più recente per ultimo. */
  items: readonly MonthStripItem[]
  selected: MonthKey
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

  return (
    <div
      className="month-strip"
      ref={strip}
      role="group"
      aria-label="Mese da guardare"
    >
      {items.map((item) => {
        const active = item.month === selected
        const empty = toCents(item.total) === 0
        return (
          <button
            key={item.month}
            type="button"
            className={`month-chip${active ? ' is-active' : ''}`}
            aria-current={active ? 'true' : undefined}
            /* Il nome per intero al lettore di schermo: «ago 26» non è una data. */
            aria-label={monthLabel(item.month)}
            onClick={() => onSelect(item.month)}
          >
            <span className="month-chip-name">{monthLabelShort(item.month)}</span>
            <span className="month-chip-total">
              {empty ? '—' : formatEuro(item.total, { decimals: 0 })}
            </span>
          </button>
        )
      })}
    </div>
  )
}
