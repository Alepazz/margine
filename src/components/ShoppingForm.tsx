/**
 * Aggiungere o correggere una cosa da comprare.
 *
 * **Il titolo è l'unico campo obbligatorio**, ed è la richiesta di Alessio parola
 * per parola: quantità, unità, negozio e nota sono facoltativi, perché una lista
 * della spesa si scrive di corsa e con una mano sola.
 *
 * E siccome sono facoltativi, **non si vedono**: stanno dietro un pulsante, e
 * aggiungere una cosa è un nome più Invio. La prima versione li mostrava tutti e
 * tre, con «1» nel campo della quantità, e Alessio l'ha bocciata — «è fuorviante
 * il numero di default», «a noi basta scrivere un generico Carne e la quantità la
 * si vede poi». Un campo visibile è una domanda, e a queste tre domande la
 * risposta è quasi sempre nessuna. → ADR-0089
 *
 * **In aggiunta il modulo non si chiude quando salva**, come quello dei prezzi e
 * per la stessa ragione: si scrivono cinque cose in fila. Resta il negozio, che
 * è il contesto del giro, e si azzera il resto col fuoco di nuovo sul titolo.
 * In correzione invece è un gesto singolo, e chi chiama chiude.
 */

import { useRef, useState, type ReactNode } from 'react'

import { todayIso } from '../domain/dates'
import { newShoppingId } from '../domain/ids'
import { suggest } from '../domain/prices'
import { SHOPPING_UNITS, SHOPPING_UNIT_CHOICE, validateShoppingItem } from '../domain/shopping'
import type { ShoppingItem, ShoppingUnit } from '../domain/types'
import { AmountInput, NameWithSuggestions } from './ui'

export function ShoppingForm({
  item,
  items,
  storeOptions,
  onSave,
  onCancel,
  onDelete,
  onProblem,
}: {
  /** La voce da correggere; assente = se ne aggiunge una nuova. */
  item?: ShoppingItem
  /** Le voci già in lista: da qui vengono i suggerimenti e gli id già presi. */
  items: readonly ShoppingItem[]
  /** I negozi da proporre: quelli della lista, dei prezzi e delle carte fedeltà. */
  storeOptions: readonly string[]
  /** In aggiunta si chiama a ogni voce e il modulo resta aperto; in correzione una volta. */
  onSave: (item: ShoppingItem) => void
  onCancel: () => void
  /** Presente solo in correzione. */
  onDelete?: () => void
  /** I problemi li mostra chi chiama, dove ha senso nella sua pagina. */
  onProblem: (message: string) => void
}): ReactNode {
  const [title, setTitle] = useState(item?.title ?? '')
  const [qty, setQty] = useState(item?.qty !== undefined ? String(item.qty).replace('.', ',') : '')
  const [unit, setUnit] = useState<ShoppingUnit>(item?.unit ?? 'pezzo')
  const [store, setStore] = useState(item?.store ?? '')
  const [note, setNote] = useState(item?.note ?? '')
  /** Quante ne ha aggiunte in questo giro: lo dice il pulsante che chiude. */
  const [added, setAdded] = useState(0)
  /*
   * I tre facoltativi si aprono a richiesta. Aperti di partenza **solo** se la
   * voce che si sta correggendo ne ha almeno uno: là il dettaglio è il motivo per
   * cui hai toccato la matita. E una volta aperti restano aperti anche dopo un
   * salvataggio, perché chi aggiunge cinque cose con la quantità la vuole cinque
   * volte.
   */
  const [details, setDetails] = useState(
    item !== undefined &&
      (item.qty !== undefined || item.store !== undefined || item.note !== undefined),
  )
  const titleRef = useRef<HTMLInputElement | null>(null)

  const editing = item !== undefined

  const save = (): void => {
    const quantita = qty.trim() === '' ? undefined : Number(qty.replace(',', '.'))
    const next: ShoppingItem = {
      id: item?.id ?? newShoppingId(todayIso()),
      title: title.trim(),
      /* Quantità e unità viaggiano insieme: senza il numero l'unità non vuol
         dire niente, e i due validatori la rifiutano. */
      ...(quantita !== undefined ? { qty: quantita, unit } : {}),
      ...(store.trim() !== '' ? { store: store.trim() } : {}),
      ...(note.trim() !== '' ? { note: note.trim() } : {}),
      wantedAt: item?.wantedAt ?? new Date().toISOString(),
      ...(item?.takenAt !== undefined ? { takenAt: item.takenAt } : {}),
    }
    /* Gli id già presi non comprendono il proprio, o correggere una voce
       risulterebbe un doppione di se stessa. */
    const altri = new Set(items.map((i) => i.id).filter((id) => id !== item?.id))
    const problems = validateShoppingItem(next, altri)
    if (problems.length > 0) return onProblem(problems[0] ?? 'Voce non valida.')

    onSave(next)
    if (editing) return

    /*
     * Resta il **negozio**, che è il contesto del giro, e si azzera il resto.
     * L'unità torna a «pezzi» come la quantità torna vuota: con l'unità ancora
     * addosso, la cosa dopo — che magari si conta a pezzi — ripartirebbe dai
     * grammi del macinato. È la trappola di ADR-0041, e qui costa meno perché
     * la quantità è facoltativa.
     */
    setTitle('')
    setQty('')
    setUnit('pezzo')
    setNote('')
    setAdded((n) => n + 1)
    titleRef.current?.focus()
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <NameWithSuggestions
        id="shop-title"
        label="Cosa"
        placeholder="Latte"
        value={title}
        /*
         * **Solo dopo aver scritto qualcosa.** Con il campo vuoto i sei
         * suggerimenti riempiono tre righe e spingono giù tutto il resto — visto
         * al banco — e non servono a niente: l'elenco dei soliti è lo storico,
         * che sta già nella pagina sotto il modulo. Da un carattere in su invece
         * sono la cosa che tiene «Latte» una voce sola. → ADR-0089
         */
        options={title.trim() === '' ? [] : suggest(items.map((i) => i.title), title)}
        onChange={setTitle}
        /* Invio aggiunge: è il gesto del giro, cinque cose senza mai staccare
           la mano dalla tastiera del telefono. */
        onEnter={save}
        inputRef={titleRef}
      />

      {details ? (
        <>
          <div className="field">
            <label className="label" htmlFor="shop-qty">
              Quanto
            </label>
            <div className="qty-row">
              {/* Senza segnaposto: un «1» dentro il campo si legge come un
                  valore, e invita a riempire una casella che quasi sempre resta
                  vuota. → ADR-0089 */}
              <AmountInput id="shop-qty" value={qty} onChange={setQty} ariaLabel="Quantità" />
              <select
                className="select"
                value={unit}
                aria-label="Unità della quantità"
                onChange={(event) => setUnit(event.target.value as ShoppingUnit)}
              >
                {SHOPPING_UNITS.map((value) => (
                  <option key={value} value={value}>
                    {SHOPPING_UNIT_CHOICE[value]}
                  </option>
                ))}
              </select>
            </div>
            <p className="hint">Solo se serve: «3 pezzi», «500 grammi».</p>
          </div>

          <NameWithSuggestions
            id="shop-store"
            label="Dove"
            placeholder="Ovunque"
            value={store}
            /*
             * Col campo vuoto **tre**, non sei: sei negozi fanno tre righe, e la
             * metà utile è quella dei posti in cui vai davvero — i più recenti,
             * l'ordine che `suggest` già dà. Appena si scrive tornano tutti
             * quelli che combaciano, perché là servono a ritrovare una grafia.
             */
            options={
              store.trim() === ''
                ? suggest(storeOptions, '').slice(0, 3)
                : suggest(storeOptions, store)
            }
            onChange={setStore}
          >
            <p className="hint">
              Solo quando una cosa va presa in un posto preciso: nel caso normale
              il negozio si sa già.
            </p>
          </NameWithSuggestions>

          <div className="field">
            <label className="label" htmlFor="shop-note">
              Nota
            </label>
            <input
              id="shop-note"
              className="input"
              type="text"
              placeholder="La marca, il formato…"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetails(true)}>
          + Quantità, negozio o nota
        </button>
      )}

      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn btn-primary" onClick={save}>
          {editing ? 'Salva' : 'Aggiungi'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          {editing || added === 0 ? 'Annulla' : 'Ho finito'}
        </button>
      </div>

      {onDelete ? (
        <button type="button" className="btn btn-danger btn-sm" onClick={onDelete}>
          Elimina dalla lista
        </button>
      ) : null}

      {added > 0 ? (
        <p className="hint">
          {added === 1 ? '1 cosa aggiunta' : `${String(added)} cose aggiunte`} in questo giro. Il
          negozio resta: scrivi la prossima.
        </p>
      ) : null}
    </div>
  )
}
