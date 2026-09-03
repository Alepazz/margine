/**
 * Il modulo delle carte in un foglio dal basso.
 *
 * Come `PriceSheet`: il modulo si apre da tre posti — il `+` dell'isola quando
 * sei sulle carte, il pulsante nella pagina, e «Modifica» dalla tessera aperta —
 * e un modulo dentro una scheda non può essere aperto da chi sta su un'altra
 * rotta.
 *
 * Il corpo sta in `.sheet-body`, e non è facoltativo: un foglio senza quel
 * contenitore non scorre e non taglia, **disegna fuori** dal bordo arrotondato,
 * e da quando il guscio non scorre il contenuto oltre il tetto è irraggiungibile.
 * → ADR-0030, ADR-0048
 */

import { useEffect, useRef, type ReactNode } from 'react'

import { useReadyStore } from '../data/store'
import type { LoyaltyCard } from '../domain/types'
import { CardForm } from './CardForm'
import { useEscape, useScrollLock, useToast } from './ui'

/**
 * Solo i campi che sono cambiati davvero.
 *
 * Due ragioni, e la prima è di correttezza per **come** si cancella un campo: un
 * `card-edit` si applica come `{ ...carta, ...campi }`, quindi un campo assente
 * vuol dire «lascia com'era» e per togliere una nota bisogna dire qualcosa —
 * `undefined` non sopravvive a `JSON.stringify` nella coda in `localStorage`,
 * quindi si dice con la **stringa vuota**.
 *
 * La seconda è il peso: mandare tutto vorrebbe dire far riattraversare la coda
 * — cioè `localStorage`, dove il browser concede circa cinque megabyte — a
 * un'immagine da venti kilobyte **per ogni rinomino**. Un campo immutato non ha
 * niente da dire.
 */
function changedFields(before: LoyaltyCard, after: LoyaltyCard): Partial<LoyaltyCard> {
  const fields: Partial<LoyaltyCard> = {}
  if (after.name !== before.name) fields.name = after.name
  if (after.code !== before.code) fields.code = after.code
  if (after.format !== before.format) fields.format = after.format
  /* I tre facoltativi: assenti nel nuovo vuol dire «togli», e si dice con ''. */
  if ((after.note ?? '') !== (before.note ?? '')) fields.note = after.note ?? ''
  if ((after.image ?? '') !== (before.image ?? '')) fields.image = after.image ?? ''
  if ((after.color ?? '') !== (before.color ?? '')) fields.color = after.color ?? ''
  return fields
}

export function CardSheet({
  card,
  onClose,
}: {
  /** La carta da correggere; assente = se ne aggiunge una nuova. */
  card?: LoyaltyCard
  onClose: () => void
}): ReactNode {
  const { cards, addCard, updateCard } = useReadyStore()
  const toast = useToast()
  const sheetRef = useRef<HTMLDivElement | null>(null)

  useScrollLock()
  useEscape(onClose)

  useEffect(() => {
    /* Il fuoco sul foglio e non sul primo campo: dare il fuoco a un campo di
       testo fa saltare su la tastiera e coprire metà schermo. */
    sheetRef.current?.focus()
  }, [])

  const titolo = card ? 'Modifica la carta' : 'Aggiungi una carta'

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
        aria-label={titolo}
        tabIndex={-1}
        ref={sheetRef}
      >
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: '1.15rem' }}>{titolo}</h2>
            <p className="card-note">Il numero stampato sotto le barre, e come è fatto il codice</p>
          </div>
          <button
            type="button"
            className="btn btn-icon btn-ghost"
            onClick={onClose}
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>

        <div className="sheet-body">
          <CardForm
            card={card}
            taken={new Set(cards.map((entry) => entry.id))}
            onCancel={onClose}
            onProblem={(message) => toast.show(message)}
            onSave={(next) => {
              if (card) {
                const fields = changedFields(card, next)
                if (Object.keys(fields).length === 0) {
                  toast.show('Niente da cambiare.')
                  onClose()
                  return
                }
                updateCard(card.id, fields)
                toast.show(`${next.name}: carta aggiornata.`)
              } else {
                addCard(next)
                toast.show(`${next.name}: carta aggiunta.`)
              }
              onClose()
            }}
          />
        </div>
      </div>
    </div>
  )
}
