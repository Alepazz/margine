/**
 * Aggiungere o correggere una carta fedeltà.
 *
 * **Il codice si vede disegnato mentre lo si scrive**, e non è un vezzo: è la
 * sola cosa che impedisce di salvare una tessera che alla cassa non passerà.
 * Un formato sbagliato o una cifra letta male su una tessera consumata non si
 * vedono guardando dieci cifre in un campo; si vedono se le barre non compaiono
 * e una riga dice perché. Senza questo, l'errore lo trova la cassiera.
 *
 * Il modulo **si chiude quando salva**, al contrario di quello dei prezzi: le
 * carte si aggiungono una alla volta, in casa, guardando la tessera. Non è una
 * sessione come il giro degli scaffali.
 */

import { useRef, useState, type ReactNode } from 'react'

import { cardFaceFrom, dominantColor } from '../data/card-image'
import { barcodeProblem, encodeBarcode, groupCode } from '../domain/barcode'
import { FORMAT_HINT, FORMAT_LABEL, formatOptions, inkOn, validateCard } from '../domain/cards'
import { todayIso } from '../domain/dates'
import { newCardId } from '../domain/ids'
import type { CardFormat, LoyaltyCard } from '../domain/types'
import { Barcode } from './Barcode'

export function CardForm({
  /** La carta da correggere; assente = se ne aggiunge una nuova. */
  card,
  /** Gli id già usati: servono a non produrne uno doppio. */
  taken,
  onSave,
  onCancel,
  onProblem,
}: {
  card?: LoyaltyCard
  taken: ReadonlySet<string>
  onSave: (card: LoyaltyCard) => void
  onCancel: () => void
  /** I problemi li mostra chi chiama, dove ha senso nella sua pagina. */
  onProblem: (message: string) => void
}): ReactNode {
  const [name, setName] = useState(card?.name ?? '')
  const [code, setCode] = useState(card?.code ?? '')
  const [format, setFormat] = useState<CardFormat>(card?.format ?? 'ean13')
  const [note, setNote] = useState(card?.note ?? '')
  const [image, setImage] = useState(card?.image ?? '')
  const [color, setColor] = useState(card?.color ?? '')
  const [reading, setReading] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  /* Il disegno di adesso, a ogni tasto: è l'anteprima. */
  const drawn = encodeBarcode(code, format)
  const problem = barcodeProblem(code, format)
  const numero = groupCode(code, format)

  const pickImage = async (file: File | undefined): Promise<void> => {
    if (!file) return
    setReading(true)
    const result = await cardFaceFrom(file)
    setReading(false)
    if ('problem' in result) return onProblem(result.problem)
    setImage(result.image)
    /* Il colore si ricava dalla faccia una volta sola, adesso: farlo a ogni
       disegno vorrebbe dire leggere i pixel di ogni tessera a ogni apertura
       dell'elenco. Se non si ricava, la fascia usa una tinta neutra. */
    const found = await dominantColor(result.image)
    if (found !== undefined) setColor(found)
  }

  const save = (): void => {
    const next: LoyaltyCard = {
      id: card?.id ?? newCardId(todayIso()),
      name: name.trim(),
      code: code.trim(),
      format,
      addedAt: card?.addedAt ?? todayIso(),
      ...(note.trim() !== '' ? { note: note.trim() } : {}),
      ...(image !== '' ? { image } : {}),
      ...(color !== '' ? { color } : {}),
    }
    /* Gli id già presi non comprendono il proprio, o correggere una carta
       risulterebbe un doppione di se stessa. */
    const others = new Set([...taken].filter((id) => id !== card?.id))
    const problems = validateCard(next, others)
    if (problems.length > 0) return onProblem(problems[0] ?? 'Carta non valida.')
    onSave(next)
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="field">
        <label className="label" htmlFor="card-name">
          Negozio
        </label>
        <input
          id="card-name"
          className="input"
          type="text"
          autoComplete="off"
          placeholder="Come lo chiami tu"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="card-code">
          Numero della carta
        </label>
        <input
          id="card-code"
          className="input"
          type="text"
          /*
           * `inputMode` numerico ma `type` testo, come per gli importi: il tipo
           * numerico mangia gli zeri iniziali, e in un EAN-13 lo zero davanti è
           * una cifra come le altre — quella della carta del primo screenshot
           * comincia proprio per zero.
           */
          inputMode={format === 'code128' || format === 'code39' ? 'text' : 'numeric'}
          autoComplete="off"
          autoCapitalize={format === 'code39' ? 'characters' : 'off'}
          spellCheck={false}
          placeholder="Le cifre stampate sotto il codice"
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
        <p className="hint">Copia le cifre stampate sotto le barre, senza spazi.</p>
      </div>

      <div className="field">
        <label className="label" htmlFor="card-format">
          Tipo di codice
        </label>
        <select
          id="card-format"
          className="select"
          value={format}
          onChange={(event) => setFormat(event.target.value as CardFormat)}
        >
          {formatOptions(card?.format).map((option) => (
            <option key={option} value={option}>
              {FORMAT_LABEL[option]} — {FORMAT_HINT[option]}
            </option>
          ))}
        </select>
      </div>

      {/*
        L'anteprima. Occupa spazio nel modulo e se lo merita: è il controllo
        finale, e a schermo è quello che si vedrà alla cassa.
      */}
      <div className="field">
        <span className="label">Come si vedrà</span>
        {drawn ? (
          <div className="card-preview">
            <Barcode code={drawn} label={numero} />
            <div className="card-number is-small">{numero}</div>
          </div>
        ) : (
          <p className={problem !== undefined && code.trim() !== '' ? 'hint is-warn' : 'hint'}>
            {problem ?? 'Scrivi il numero e scegli il tipo di codice.'}
          </p>
        )}
      </div>

      <div className="field">
        <span className="label">Faccia della tessera</span>
        <div className="row row-inline" style={{ gap: 8 }}>
          {image !== '' ? (
            <img
              className="card-face-thumb"
              src={image}
              alt=""
              style={color !== '' ? { background: color } : undefined}
            />
          ) : (
            <span
              className="card-face-thumb is-empty"
              style={{ background: color !== '' ? color : 'var(--surface-2)' }}
              aria-hidden="true"
            />
          )}
          <div className="stack" style={{ gap: 4, flex: '1 1 auto', minWidth: 0 }}>
            <button
              type="button"
              className="btn btn-sm"
              disabled={reading}
              onClick={() => fileRef.current?.click()}
            >
              {reading ? 'Sto leggendo…' : image !== '' ? 'Cambia immagine' : 'Scegli un’immagine'}
            </button>
            {image !== '' ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setImage('')
                  setColor('')
                }}
              >
                Togli l’immagine
              </button>
            ) : null}
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            void pickImage(event.target.files?.[0])
            /* Azzerato, o riscegliere lo stesso file non fa scattare niente. */
            event.target.value = ''
          }}
        />
        <p className="hint">
          Facoltativa. Uno screenshot della tessera va benissimo: viene rimpicciolita da sé, e il
          colore della fascia si ricava da lei.
        </p>
      </div>

      <div className="field">
        <label className="label" htmlFor="card-note">
          Nota
        </label>
        <input
          id="card-note"
          className="input"
          type="text"
          placeholder="Numero cliente, PIN… (facoltativo)"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn btn-primary" onClick={save}>
          {card ? 'Salva' : 'Aggiungi la carta'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Annulla
        </button>
      </div>

      {color !== '' ? (
        <p className="hint">
          La fascia della tessera sarà {color}, con il testo {inkOn(color)}.
        </p>
      ) : null}
    </div>
  )
}
