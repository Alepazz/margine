/**
 * Di chi è questo dispositivo: si chiede una volta, alla prima apertura, e non
 * si cambia più dall'app. → ADR-0042
 *
 * Sta dopo lo sblocco e prima di tutto il resto, come il `Gate`: chi non ha
 * ancora scelto non vede una pagina con i numeri di qualcuno, vede questa. È il
 * motivo per cui la schermata esiste — prima l'identità aveva un valore di
 * ripiego, e il ripiego era una persona vera.
 *
 * La scelta chiede una conferma perché è irreversibile dall'interfaccia: un
 * tocco distratto costa svuotare i dati del sito e rimettere passphrase e token.
 */

import { useState, type ReactNode } from 'react'

import { useStore } from '../data/store'
import { PERSON_IDS, titleOf, type PersonId } from '../domain/types'

export function IdentityGate(): ReactNode {
  const { config, chooseIdentity } = useStore()
  const [picked, setPicked] = useState<PersonId | null>(null)

  if (!config) return null

  const name = (id: PersonId): string => titleOf(config.people[id])

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="brand">
          <span className="brand-rule" aria-hidden="true" />
          <div>
            <div className="brand-name">Margine</div>
            <div className="brand-sub">spese e prezzi</div>
          </div>
        </div>

        {picked === null ? (
          <>
            <div>
              <h1 className="gate-title">Di chi è questo dispositivo?</h1>
              <p className="gate-text">
                Tutta l'app parlerà di quella persona: le sue spese, il suo margine, i suoi
                tricount. Si sceglie una volta e resta su questo dispositivo.
              </p>
            </div>

            <div className="stack" style={{ gap: 8 }}>
              {PERSON_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="btn identity-choice"
                  onClick={() => setPicked(id)}
                >
                  <span className="avatar" aria-hidden="true">
                    {config.people[id].emoji}
                  </span>
                  <span>Sono {config.people[id].name}</span>
                </button>
              ))}
            </div>

            <p className="hint">
              La scelta non si cambia dall'app: se questo dispositivo dovesse passare all'altra
              persona, si svuotano i dati del sito dal browser e si ricomincia da qui.
            </p>
          </>
        ) : (
          <>
            <div>
              <h1 className="gate-title">{name(picked)}, confermi?</h1>
              <p className="gate-text">
                Da qui in poi questo dispositivo è di {config.people[picked].name}, e{' '}
                <strong>non si cambia dall'app</strong>. Per assegnarlo all'altra persona servirà
                svuotare i dati del sito dal browser, e rimettere passphrase e token.
              </p>
            </div>

            <button type="button" className="btn btn-primary" onClick={() => chooseIdentity(picked)}>
              Sì, sono {config.people[picked].name}
            </button>
            <button type="button" className="btn" onClick={() => setPicked(null)}>
              No, torna indietro
            </button>
          </>
        )}
      </div>
    </div>
  )
}
