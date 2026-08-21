/**
 * Registrare un prezzo visto a scaffale.
 *
 * Si scrive **il prezzo per unità di misura**, non quello della confezione: in
 * Italia l'etichetta lo riporta per legge, quindi è un numero da copiare e non
 * da calcolare — e una calcolatrice confezione/peso dentro il modulo sarebbe un
 * passaggio in più al posto di uno in meno. → ADR-0041
 *
 * Prodotto e supermercato sono testo libero con i nomi già usati proposti sotto
 * il campo. Riusare un suggerimento non è una comodità: è ciò che tiene unita la
 * serie di quel prodotto, perché il confronto raggruppa per nome.
 *
 * **Il modulo non si chiude quando salva.** Registrare i prezzi è una sessione,
 * non un gesto singolo: si fa il giro degli scaffali con cinque prodotti in
 * mente, e supermercato e data sono gli stessi per tutti. Dopo un salvataggio
 * restano quelli e si azzera il resto, col fuoco di nuovo sul prodotto — cinque
 * prodotti passano da cinque moduli interi a un supermercato più cinque coppie
 * nome/prezzo. Chiudere lo dice chi ha finito, col suo pulsante.
 */

import { useRef, useState, type ReactNode, type Ref } from 'react'

import { todayIso } from '../domain/dates'
import { newPriceId } from '../domain/ids'
import { suggest, unitOf, UNIT_CHOICE, UNIT_LABEL, PRICE_UNITS } from '../domain/prices'
import { nameKey } from '../domain/text'
import type { PriceEntry, PriceUnit } from '../domain/types'
import { AmountInput, Segmented } from './ui'

/** Un campo di testo con i nomi già usati sotto, tappabili. */
function NameWithSuggestions({
  id,
  label,
  placeholder,
  value,
  known,
  onChange,
  inputRef,
}: {
  id: string
  label: string
  placeholder: string
  value: string
  /** Tutti i valori già scritti, in ordine di inserimento. */
  known: readonly string[]
  onChange: (value: string) => void
  inputRef?: Ref<HTMLInputElement>
}): ReactNode {
  /* Non si propone quello che è già scritto per intero: sarebbe un pulsante che
     non fa niente. */
  const options = suggest(known, value).filter((option) => nameKey(option) !== nameKey(value))

  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        ref={inputRef}
        onChange={(event) => onChange(event.target.value)}
      />
      {options.length > 0 ? (
        <div className="suggest">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className="suggest-chip"
              onClick={() => onChange(option)}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function PriceForm({
  prices,
  onSave,
  onDone,
  onProblem,
}: {
  /** Le rilevazioni già registrate: da qui vengono i suggerimenti e l'unità. */
  prices: readonly PriceEntry[]
  /** Chiamata a ogni rilevazione salvata: il modulo resta aperto per la prossima. */
  onSave: (entry: PriceEntry) => void
  /** Ha finito il giro: chiude. */
  onDone: () => void
  /** I problemi li mostra chi chiama, dove ha senso nella sua pagina. */
  onProblem: (message: string) => void
}): ReactNode {
  const [product, setProduct] = useState('')
  const [store, setStore] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIso())
  const [note, setNote] = useState('')
  const [unit, setUnit] = useState<PriceUnit>('kg')
  /** Quante ne ha registrate in questo giro: lo dice il pulsante che chiude. */
  const [saved, setSaved] = useState(0)
  const productRef = useRef<HTMLInputElement | null>(null)
  /*
   * Finché non si tocca il controllo, l'unità è quella con cui il prodotto è già
   * stato rilevato: è l'unica cosa che evita di spaccare in due gruppi un
   * prodotto che si vuole confrontare, sbagliando un tocco. Appena la si
   * cambia a mano, vince la scelta — senza `useEffect`, che qui litigherebbe con
   * chi sta scrivendo.
   */
  const [unitTouched, setUnitTouched] = useState(false)
  const suggested = unitOf(prices, product)
  const chosen = unitTouched ? unit : (suggested ?? unit)

  const save = (): void => {
    const cleanProduct = product.trim()
    const cleanStore = store.trim()
    if (cleanProduct === '') return onProblem('Serve il nome del prodotto.')
    if (cleanStore === '') return onProblem('Serve il supermercato.')

    const value = Number(amount.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) {
      return onProblem('Il prezzo deve essere maggiore di zero.')
    }

    const entry: PriceEntry = {
      id: newPriceId(date),
      product: cleanProduct,
      store: cleanStore,
      unit: chosen,
      price: Math.round(value * 100) / 100,
      date,
      ...(note.trim() !== '' ? { note: note.trim() } : {}),
    }
    onSave(entry)

    /*
     * Resta il contesto del giro — supermercato e data — e si azzera la
     * rilevazione. L'unità torna al valore di partenza **e** a «non scelta»:
     * servono entrambe le cose, e la seconda da sola non basta. Con `unit`
     * ancora a «al pezzo», il prodotto dopo — che non ha una sua unità nei dati,
     * quindi non ha niente da suggerire — ripartiva da lì: l'unità del pecorino
     * appiccicata al latte, che è esattamente lo sbaglio da un tocco che spacca
     * in due gruppi un prodotto da confrontare.
     */
    setProduct('')
    setAmount('')
    setNote('')
    setUnit('kg')
    setUnitTouched(false)
    setSaved((n) => n + 1)
    productRef.current?.focus()
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <NameWithSuggestions
        id="price-product"
        label="Prodotto"
        placeholder="Passata di pomodoro"
        value={product}
        known={prices.map((entry) => entry.product)}
        onChange={setProduct}
        inputRef={productRef}
      />

      <NameWithSuggestions
        id="price-store"
        label="Supermercato"
        placeholder="Esselunga"
        value={store}
        known={prices.map((entry) => entry.store)}
        onChange={setStore}
      />

      <div className="field">
        <span className="label" id="price-unit-label">
          Prezzo riferito a
        </span>
        <Segmented
          options={PRICE_UNITS.map((value) => ({ value, label: UNIT_CHOICE[value] }))}
          value={chosen}
          ariaLabel="Unità di misura del prezzo"
          onChange={(value) => {
            setUnitTouched(true)
            setUnit(value)
          }}
        />
        {suggested && !unitTouched ? (
          <p className="hint">
            «{product.trim()}» è già rilevato {UNIT_CHOICE[suggested]}: tenendo la stessa unità i
            prezzi si confrontano fra loro.
          </p>
        ) : null}
      </div>

      <div className="field">
        <label className="label" htmlFor="price-amount">
          Prezzo {UNIT_LABEL[chosen]}
        </label>
        <AmountInput
          id="price-amount"
          value={amount}
          placeholder="2,15"
          onChange={setAmount}
          ariaLabel={`Prezzo in ${UNIT_LABEL[chosen]}`}
        />
        <p className="hint">Quello scritto in piccolo sull'etichetta a scaffale.</p>
      </div>

      <div className="field">
        <label className="label" htmlFor="price-date">
          Quando l'hai visto
        </label>
        <input
          id="price-date"
          className="input"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="price-note">
          Nota
        </label>
        <input
          id="price-note"
          className="input"
          type="text"
          placeholder="In offerta, marca del supermercato… (facoltativo)"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn btn-primary" onClick={save}>
          Registra
        </button>
        <button type="button" className="btn" onClick={onDone}>
          {saved === 0 ? 'Annulla' : 'Ho finito'}
        </button>
      </div>

      {saved > 0 ? (
        <p className="hint">
          {saved === 1 ? '1 prezzo registrato' : `${saved} prezzi registrati`} in questo giro.
          Supermercato e data restano: scrivi il prossimo prodotto.
        </p>
      ) : null}
    </div>
  )
}
