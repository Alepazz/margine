/**
 * Schermata di sblocco.
 *
 * Chi arriva sull'indirizzo senza passphrase vede questa e nient'altro: i dati
 * sono cifrati nel file, non nascosti dietro un controllo dell'interfaccia.
 */

import { useState, type ReactNode } from 'react'

import { useStore } from '../data/store'
import { Brand } from './ui'

export function Gate(): ReactNode {
  const { status, error, unlock, reload } = useStore()
  const [passphrase, setPassphrase] = useState('')
  const [remember, setRemember] = useState(true)
  const busy = status === 'unlocking' || status === 'boot'

  if (status === 'error') {
    return (
      <div className="gate">
        <div className="gate-card">
          <Brand sub={false} />
          <h1 className="gate-title">Non riesco ad aprire i dati</h1>
          <p className="gate-text">{error}</p>
          <button type="button" className="btn btn-primary" onClick={reload}>
            Riprova
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="gate">
      <form
        className="gate-card"
        onSubmit={(event) => {
          event.preventDefault()
          if (passphrase.length === 0) return
          void unlock(passphrase, remember)
        }}
      >
        <Brand />

        <div>
          <h1 className="gate-title">Sblocca i dati</h1>
          <p className="gate-text">
            Le spese sono cifrate nel file: serve la passphrase per leggerle. Non lascia questo
            dispositivo.
          </p>
        </div>

        <div className="field">
          <label className="label" htmlFor="passphrase">
            Passphrase
          </label>
          <input
            id="passphrase"
            className="input"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            disabled={busy}
          />
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          Ricorda su questo dispositivo
        </label>

        {error ? <p className="delta is-bad">{error}</p> : null}

        <button type="submit" className="btn btn-primary" disabled={busy || passphrase.length === 0}>
          {busy ? (
            <>
              <span className="spin" aria-hidden="true" /> apro…
            </>
          ) : (
            'Apri'
          )}
        </button>

        <p className="hint">
          Ricordare la passphrase salva un file in questo browser: comodo sul tuo telefono, da
          evitare su un computer condiviso.
        </p>
      </form>
    </div>
  )
}
