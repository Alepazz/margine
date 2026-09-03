/**
 * Il modulo della lista in un foglio dal basso.
 *
 * Come `PriceSheet` e `CardSheet`: si apre da due posti — il `+` dell'isola
 * quando sei sulla lista, e il pulsante nella pagina — e in correzione lo apre
 * la matita di una riga.
 *
 * Il corpo sta in `.sheet-body`, e non è facoltativo: un foglio senza quel
 * contenitore non scorre e non taglia, **disegna fuori** dal bordo arrotondato,
 * e da quando il guscio non scorre il contenuto oltre il tetto è irraggiungibile.
 * → ADR-0030, ADR-0048
 */

import { useEffect, useRef, type ReactNode } from 'react'

import { useReadyStore } from '../data/store'
import { revivedFields } from '../domain/shopping'
import { nameKey } from '../domain/text'
import type { ShoppingItem } from '../domain/types'
import { ShoppingForm } from './ShoppingForm'
import { useEscape, useScrollLock, useToast } from './ui'

/**
 * Solo i campi che sono cambiati davvero.
 *
 * Come per le carte, e con la stessa trappola: un `list-edit` si applica come
 * `{ ...voce, ...campi }`, quindi un campo assente vuol dire «lascia com'era» e
 * per **togliere** qualcosa bisogna dirlo — con la stringa vuota per il testo e
 * con lo **zero** per la quantità, perché `undefined` non sopravvive a
 * `JSON.stringify` nella coda in `localStorage`.
 *
 * `unit` non ha un valore «vuoto» e non ne ha bisogno: togliendo la quantità
 * cade anche l'unità, perché sono un campo solo in due pezzi.
 */
function changedFields(before: ShoppingItem, after: ShoppingItem): Partial<ShoppingItem> {
  const fields: Partial<ShoppingItem> = {}
  if (after.title !== before.title) fields.title = after.title
  if (after.qty !== before.qty) fields.qty = after.qty ?? 0
  if (after.qty !== undefined && after.unit !== before.unit) fields.unit = after.unit
  if ((after.store ?? '') !== (before.store ?? '')) fields.store = after.store ?? ''
  if ((after.note ?? '') !== (before.note ?? '')) fields.note = after.note ?? ''
  return fields
}

export function ShoppingSheet({
  item,
  onClose,
}: {
  /** La voce da correggere; assente = se ne aggiunge una nuova. */
  item?: ShoppingItem
  onClose: () => void
}): ReactNode {
  const { shopping, dataset, cards, addItem, updateItem, untakeItem, deleteItem } = useReadyStore()
  const toast = useToast()
  const sheetRef = useRef<HTMLDivElement | null>(null)

  useScrollLock()
  useEscape(onClose)

  useEffect(() => {
    /* Il fuoco sul foglio e non sul primo campo: dare il fuoco a un campo di
       testo fa saltare su la tastiera e coprire metà schermo. */
    sheetRef.current?.focus()
  }, [])

  const titolo = item ? 'Modifica la voce' : 'Aggiungi alla lista'

  /*
   * I negozi da proporre vengono da tre posti, e non è un vezzo: sono gli stessi
   * negozi visti da tre lati dell'app — dove hai già mandato una cosa, dove hai
   * rilevato un prezzo, e di chi hai la tessera fedeltà. Riusare una grafia è
   * ciò che tiene insieme le sezioni della lista.
   */
  const storeOptions = [
    ...shopping.map((i) => i.store ?? ''),
    ...dataset.prices.map((p) => p.store),
    ...cards.map((c) => c.name),
  ].filter((name) => name.trim() !== '')

  return (
    <div
      className="sheet-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        /*
         * `sheet` e non `sheet is-form`: quell'altezza fissa (90dvh) serve ai
         * moduli lunghi — spesa, prezzo, carta — dove tiene il foglio fermo
         * mentre i campi appaiono e sparistono. Qui il modulo è **un campo**, e
         * un foglio quasi tutto vuoto allontana il pollice dal pulsante senza
         * dare niente in cambio. Il prezzo è che il foglio cresce quando si
         * aprono i facoltativi: è un movimento che si capisce, perché lo hai
         * chiesto tu con un tocco. → ADR-0089, ADR-0030
         */
        className="sheet"
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
            <p className="card-note">Basta il nome: il resto è facoltativo</p>
          </div>
          <button type="button" className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Chiudi">
            ✕
          </button>
        </div>

        <div className="sheet-body">
          <ShoppingForm
            item={item}
            items={shopping}
            storeOptions={storeOptions}
            onCancel={onClose}
            onProblem={(message) => toast.show(message)}
            {...(item
              ? {
                  onDelete: () => {
                    deleteItem(item.id)
                    toast.show(`«${item.title}» eliminata dalla lista.`)
                    onClose()
                  },
                }
              : {})}
            onSave={(next) => {
              if (item) {
                const fields = changedFields(item, next)
                if (Object.keys(fields).length === 0) {
                  toast.show('Niente da cambiare.')
                  onClose()
                  return
                }
                updateItem(item.id, fields)
                toast.show(`«${next.title}»: voce aggiornata.`)
                onClose()
                return
              }

              /*
               * **Una cosa che c'è già non si duplica.** È il modello di Bring
               * (→ ADR-0089): lo storico è il catalogo dei prodotti di casa,
               * quindi scrivere «Latte» quando un «Latte» sta nello storico deve
               * riportare **quello** in lista, non crearne un secondo. Senza,
               * ogni giro lascerebbe un doppione nel catalogo e dopo un mese
               * nessuno riconoscerebbe più quale sia la voce buona.
               *
               * E se è già fra le cose da prendere, non c'è niente da fare: lo si
               * dice, invece di aggiungere una riga identica sotto quella che
               * c'è.
               */
              const esistente = shopping.find((i) => nameKey(i.title) === nameKey(next.title))
              if (esistente === undefined) {
                addItem(next)
                toast.show(`«${next.title}» aggiunta alla lista.`)
                return
              }
              if (esistente.takenAt === undefined) {
                toast.show(`«${esistente.title}» è già nella lista.`)
                return
              }
              untakeItem(esistente.id)
              /* Quello che hai scritto vince — «2 kg» vuol dire due chili — ma
                 quello che hai lasciato vuoto no: là vale la memoria della voce. */
              const fields = revivedFields(esistente, next)
              if (Object.keys(fields).length > 0) updateItem(esistente.id, fields)
              toast.show(`«${esistente.title}» torna nella lista.`)
            }}
          />
        </div>
      </div>
    </div>
  )
}
