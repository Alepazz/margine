/**
 * Creare un viaggio.
 *
 * Sta in un componente suo perché serve in due punti — dentro il modulo della
 * spesa («la vacanza non c'è ancora, la creo adesso») e nella pagina Vacanze
 * («parto la settimana prossima, apro il tricount») — e due copie dello stesso
 * modulo divergerebbero al primo campo aggiunto.
 *
 * Le coordinate non ci sono di proposito: nessuno digita una latitudine col
 * pollice. Un viaggio senza coordinate esiste come gli altri e compare
 * nell'elenco sotto il mappamondo invece che sopra. → ADR-0020
 */

import { useState, type ReactNode } from 'react'

import { todayIso } from '../domain/dates'
import { validateTrip } from '../domain/expense-rules'
import { newTripId } from '../domain/ids'
import type { Trip } from '../domain/types'
import { NameFields } from './ui'

export function TripForm({
  takenIds,
  onCreate,
  onCancel,
  onProblem,
}: {
  takenIds: ReadonlySet<string>
  onCreate: (trip: Trip) => void
  onCancel: () => void
  /** I problemi li mostra chi chiama, dove ha senso nella sua pagina. */
  onProblem: (message: string) => void
}): ReactNode {
  const [emoji, setEmoji] = useState('')
  const [name, setName] = useState('')
  const [place, setPlace] = useState('')
  const [country, setCountry] = useState('')
  const [start, setStart] = useState(todayIso())
  const [end, setEnd] = useState(todayIso())

  const create = (): void => {
    const year = Number(start.slice(0, 4))
    const candidate = {
      id: newTripId(name, Number.isFinite(year) ? year : new Date().getUTCFullYear(), takenIds),
      name: name.trim(),
      place: place.trim(),
      country: country.trim() || undefined,
      year,
      start,
      end,
    }
    const problems = validateTrip(candidate, takenIds)
    if (problems.length > 0) {
      onProblem(problems[0] ?? 'Il viaggio non è valido.')
      return
    }
    /* L'emoji è il tricount visto da lui: 🇫🇷 per Parigi. Facoltativa. */
    const trip: Trip = emoji.trim() ? { ...candidate, emoji: emoji.trim() } : (candidate as Trip)
    onCreate(trip)
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <NameFields
        emoji={emoji}
        label={name}
        onEmoji={setEmoji}
        onLabel={setName}
        what="del viaggio"
        emojiHint="🏝️"
        labelHint="Nome (Sicilia)"
      />
      <input
        className="input"
        value={place}
        placeholder="Posto (Palermo)"
        aria-label="Posto"
        onChange={(event) => setPlace(event.target.value)}
      />
      <input
        className="input"
        value={country}
        placeholder="Paese (facoltativo)"
        aria-label="Paese"
        onChange={(event) => setCountry(event.target.value)}
      />
      <div className="form-row">
        <input
          className="input"
          type="date"
          value={start}
          aria-label="Data di partenza"
          onChange={(event) => setStart(event.target.value)}
        />
        <input
          className="input"
          type="date"
          value={end}
          aria-label="Data di ritorno"
          onChange={(event) => setEnd(event.target.value)}
        />
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={create}>
          Crea il viaggio
        </button>
        <button type="button" className="btn btn-sm" onClick={onCancel}>
          Annulla
        </button>
      </div>
    </div>
  )
}
