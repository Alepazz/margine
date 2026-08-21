/**
 * Creare un tricount.
 *
 * Sta in un componente suo perché serve in tre punti — dentro il modulo della
 * spesa («la vacanza non c'è ancora, la creo adesso»), nella pagina Vacanze, e
 * in Impostazioni per un tricount qualunque — e tre copie dello stesso modulo
 * divergerebbero al primo campo aggiunto.
 *
 * **Chiede chi partecipa**: due caselle, e ne resta accesa almeno una — un
 * tricount di nessuno non sarebbe raggiungibile da nessun menù. Un membro solo
 * è un tricount personale; entrambi, uno condiviso. Come per la divisione di
 * una spesa, lo stato impossibile non è respinto: non è raggiungibile, perché
 * spegnere l'unica casella accesa non fa niente. → ADR-0037, ADR-0032
 *
 * Le coordinate non ci sono di proposito: nessuno digita una latitudine col
 * pollice. Un viaggio senza coordinate esiste come gli altri e compare
 * nell'elenco sotto il mappamondo invece che sopra. → ADR-0020
 */

import { useState, type ReactNode } from 'react'

import { useStore } from '../data/store'
import { todayIso } from '../domain/dates'
import { validateTricount, type TricountDraft } from '../domain/expense-rules'
import { newTricountId, newTripId } from '../domain/ids'
import { PERSON_IDS, titleOf, type PersonId, type Tricount } from '../domain/types'
import { NameFields } from './ui'

export function TricountForm({
  takenIds,
  vacation,
  onCreate,
  onCancel,
  onProblem,
}: {
  takenIds: ReadonlySet<string>
  /** Vero = il tricount è una vacanza: compaiono posto e date. */
  vacation: boolean
  onCreate: (tricount: Tricount) => void
  onCancel: () => void
  /** I problemi li mostra chi chiama, dove ha senso nella sua pagina. */
  onProblem: (message: string) => void
}): ReactNode {
  const { config, view } = useStore()
  const [emoji, setEmoji] = useState('')
  const [name, setName] = useState('')
  const [place, setPlace] = useState('')
  const [country, setCountry] = useState('')
  const [start, setStart] = useState(todayIso())
  const [end, setEnd] = useState(todayIso())
  /* Chi crea partecipa di sicuro: è il default che non sbaglia mai. Una vacanza
     è quasi sempre in due, quindi parte con entrambi. */
  const [members, setMembers] = useState<PersonId[]>(
    vacation ? [...PERSON_IDS] : [view.person],
  )

  /** Spegnere l'unica casella accesa non fa niente: un tricount è di qualcuno. */
  const toggleMember = (who: PersonId): void => {
    setMembers((current) => {
      if (current.includes(who)) {
        return current.length === 1 ? current : current.filter((m) => m !== who)
      }
      /* L'ordine fisso di PERSON_IDS, non quello dei tocchi: due elenchi con gli
         stessi membri devono essere lo stesso elenco. */
      return PERSON_IDS.filter((m) => m === who || current.includes(m))
    })
  }

  const create = (): void => {
    const year = Number(start.slice(0, 4))
    const trimmed = name.trim()
    const draft: TricountDraft = {
      id: vacation
        ? newTripId(trimmed, Number.isFinite(year) ? year : new Date().getUTCFullYear(), takenIds)
        : newTricountId(trimmed, takenIds),
      name: trimmed,
      members,
      ...(vacation
        ? {
            trip: {
              place: place.trim(),
              country: country.trim() || undefined,
              year,
              start,
              end,
            },
          }
        : {}),
    }
    const problems = validateTricount(draft, takenIds)
    if (problems.length > 0) {
      onProblem(problems[0] ?? 'Il tricount non è valido.')
      return
    }
    /* L'emoji è il tricount visto da chi lo usa: 🇫🇷 per Parigi. Facoltativa. */
    const tricount: Tricount = emoji.trim() ? { ...draft, emoji: emoji.trim() } : draft
    onCreate(tricount)
  }

  if (!config) return null

  return (
    <div className="stack" style={{ gap: 8 }}>
      <NameFields
        emoji={emoji}
        label={name}
        onEmoji={setEmoji}
        onLabel={setName}
        what={vacation ? 'del viaggio' : 'del tricount'}
        emojiHint={vacation ? '🏝️' : '🧾'}
        labelHint={vacation ? 'Nome (Sicilia)' : 'Nome'}
      />

      <div className="field">
        <span className="label" id="tf-members-label">
          Chi partecipa
        </span>
        <div className="split-list" role="group" aria-labelledby="tf-members-label">
          {PERSON_IDS.map((who) => {
            const on = members.includes(who)
            return (
              <div className="split-row" key={who}>
                <button
                  type="button"
                  className="split-check"
                  aria-pressed={on}
                  onClick={() => toggleMember(who)}
                >
                  <span className="split-box" aria-hidden="true">
                    {on ? '✓' : ''}
                  </span>
                  <span className="split-name">
                    {titleOf({ name: config.people[who].name, emoji: config.people[who].emoji })}
                    {who === view.person ? ' (tu)' : ''}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
        <p className="hint">
          {members.length === 1
            ? `Tricount personale: le sue spese sono tutte di ${
                config.people[members[0] ?? 'me'].name
              }, e l'altra persona non lo vede nei suoi menù.`
            : 'Tricount condiviso: le spese si dividono fra voi due.'}
        </p>
      </div>

      {vacation ? (
        <>
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
        </>
      ) : null}

      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={create}>
          {vacation ? 'Crea il viaggio' : 'Crea il tricount'}
        </button>
        <button type="button" className="btn btn-sm" onClick={onCancel}>
          Annulla
        </button>
      </div>
    </div>
  )
}
