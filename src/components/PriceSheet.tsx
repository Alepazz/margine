/**
 * Il modulo dei prezzi in un foglio dal basso.
 *
 * Esiste perché il modulo ora si apre da due posti — il `+` dell'isola e il
 * pulsante nella pagina Prezzi — e un modulo dentro una scheda della pagina non
 * può essere aperto da chi sta su un'altra rotta. È l'involucro, non la logica:
 * i campi, la validazione e la catena stanno in `PriceForm`.
 *
 * A foglio aperto la pagina sotto resta dov'era: al supermercato si alterna
 * «quanto costava?» e «lo registro», e chiudere il foglio deve riportare
 * all'elenco già scorso invece che in cima.
 */

import { useEffect, useRef, type ReactNode } from 'react'

import { useReadyStore } from '../data/store'
import { formatEuro } from '../domain/money'
import { UNIT_LABEL } from '../domain/prices'
import { PriceForm } from './PriceForm'
import { useToast } from './ui'

export function PriceSheet({ onClose }: { onClose: () => void }): ReactNode {
  const { dataset, addPrice } = useReadyStore()
  const toast = useToast()
  const sheetRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    /* Il fuoco entra nel foglio, come negli altri fogli del progetto: senza,
       resta sul `+` dietro il velo — niente da leggere per chi usa la voce, e
       `Tab` continua a scorrere la pagina sotto un dialogo che si dichiara
       modale. Sul foglio e non sul campo prodotto, perché dare il fuoco a un
       campo di testo fa saltare su la tastiera e coprire metà schermo. */
    sheetRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="sheet-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="sheet is-form"
        role="dialog"
        aria-modal="true"
        aria-label="Registra un prezzo"
        tabIndex={-1}
        ref={sheetRef}
      >
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: '1.15rem' }}>Registra un prezzo</h2>
            <p className="card-note">Il prezzo per unità, quello scritto in piccolo sull'etichetta</p>
          </div>
          <button type="button" className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Chiudi">
            ✕
          </button>
        </div>

        <div className="sheet-body">
          <PriceForm
            prices={dataset.prices}
            onDone={onClose}
            onProblem={(message) => toast.show(message)}
            onSave={(entry) => {
              addPrice(entry)
              toast.show(
                `${entry.product}: ${formatEuro(entry.price)} ${UNIT_LABEL[entry.unit]} da ${entry.store}.`,
              )
            }}
          />
        </div>
      </div>
    </div>
  )
}
