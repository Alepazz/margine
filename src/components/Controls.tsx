/**
 * Controlli di vista: chi guarda, vacanze dentro o fuori, tema, stato di sincronia.
 *
 * Il mese non si sceglie più da qui: sta in `MonthStrip`, che è una fila di
 * schede grandi come un bersaglio vero al posto di un menù a tendina.
 */

import type { ReactNode } from 'react'

import { useStore } from '../data/store'
import { formatDate } from '../domain/dates'
import { useTheme, type ThemeMode } from '../theme/theme'
import { Segmented } from './ui'

/**
 * Di chi è questo dispositivo: si **mostra**, non si cambia.
 *
 * Era un controllo con due opzioni. Non lo è più: la scelta si fa una volta alla
 * prima apertura (`IdentityGate`) e da lì è quella. Un controllo qui sarebbe
 * esattamente il gesto che ADR-0042 ha tolto — passare alla vista dell'altra
 * persona, compreso il suo compartimento personale, in due tocchi.
 *
 * Il testo dice anche cosa **non** è: la separazione resta una convenzione
 * dell'interfaccia, perché la passphrase è una sola e apre tutto il file
 * (→ ADR-0039). Toglie il gesto, non la possibilità.
 */
export function DeviceIdentity(): ReactNode {
  const { config, identity, identitySince } = useStore()
  if (!config || !identity) return null
  const person = config.people[identity]
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 10 }}>
        <span className="avatar" aria-hidden="true">
          {person.emoji}
        </span>
        <strong style={{ fontSize: '1.05rem' }}>{person.name}</strong>
      </div>
      <p className="hint">
        {identitySince
          ? `Scelto su questo dispositivo il ${formatDate(identitySince)}.`
          : 'Scelto su questo dispositivo.'}{' '}
        Non si cambia dall'app: per assegnarlo all'altra persona si svuotano i dati del sito dal
        browser, e si rimettono passphrase e token.
      </p>
    </div>
  )
}

/**
 * Le vacanze restano fuori dalle statistiche mensili: una settimana di viaggio
 * non deve far sembrare fuori media un mese normale.
 *
 * È una casella, non due pulsanti: due opzioni affiancate occupavano una riga
 * intera per dire una cosa che ha due stati.
 */
export function VacationToggle(): ReactNode {
  const { view, setIncludeVacations } = useStore()
  const on = view.includeVacations
  return (
    <button
      type="button"
      className={`chip chip-toggle${on ? ' is-on' : ''}`}
      aria-pressed={on}
      title={on ? 'Le spese di viaggio sono dentro le statistiche' : 'Le spese di viaggio restano fuori'}
      onClick={() => setIncludeVacations(!on)}
    >
      <span aria-hidden="true">{on ? '☑' : '☐'}</span>
      vacanze incluse
    </button>
  )
}

const THEME_GLYPH: Record<ThemeMode, string> = { auto: '◐', light: '☀', dark: '☾' }
const THEME_NEXT: Record<ThemeMode, ThemeMode> = { auto: 'light', light: 'dark', dark: 'auto' }
const THEME_LABEL: Record<ThemeMode, string> = {
  auto: 'automatico',
  light: 'chiaro',
  dark: 'scuro',
}

export function ThemeButton(): ReactNode {
  const { mode, setMode } = useTheme()
  return (
    <button
      type="button"
      className="btn btn-icon btn-ghost"
      title={`Tema ${THEME_LABEL[mode]} — passa a ${THEME_LABEL[THEME_NEXT[mode]]}`}
      aria-label={`Tema ${THEME_LABEL[mode]}, passa a ${THEME_LABEL[THEME_NEXT[mode]]}`}
      onClick={() => setMode(THEME_NEXT[mode])}
    >
      <span aria-hidden="true">{THEME_GLYPH[mode]}</span>
    </button>
  )
}

export function ThemeChooser(): ReactNode {
  const { mode, setMode } = useTheme()
  return (
    <Segmented<ThemeMode>
      ariaLabel="Tema"
      value={mode}
      onChange={setMode}
      options={[
        { value: 'auto', label: 'Automatico' },
        { value: 'light', label: 'Chiaro' },
        { value: 'dark', label: 'Scuro' },
      ]}
    />
  )
}

export function SyncBadge(): ReactNode {
  const { sync, syncNow } = useStore()

  if (sync.phase === 'syncing') {
    return (
      <span className="sync-badge">
        <span className="spin" aria-hidden="true" /> salvo…
      </span>
    )
  }

  if (sync.pending === 0) {
    return sync.lastSyncAt ? <span className="sync-badge">✓ salvato</span> : null
  }

  /* Il motivo sta nel titolo e per intero nelle impostazioni: nella barra ci
     serve solo il numero, altrimenti mangia il nome dell'app. */
  const reason =
    sync.phase === 'no-token'
      ? 'Manca il token GitHub: impostalo nelle impostazioni.'
      : sync.phase === 'no-config'
        ? 'Il repo non è configurato: le modifiche restano su questo dispositivo.'
        : sync.phase === 'error'
          ? (sync.lastError ?? 'Salvataggio non riuscito.')
          : 'Sto per salvare. Tocca per farlo adesso.'

  const needsAttention = sync.phase === 'error' || sync.phase === 'no-token' || sync.phase === 'no-config'

  return (
    <button
      type="button"
      className={`sync-badge ${sync.phase === 'error' ? 'is-error' : 'is-pending'}`}
      title={reason}
      aria-label={`${sync.pending} modifiche da salvare. ${reason}`}
      onClick={() => void syncNow()}
    >
      {needsAttention ? <span aria-hidden="true">!</span> : null}
      {sync.pending} da salvare
    </button>
  )
}
