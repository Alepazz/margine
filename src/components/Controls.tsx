/**
 * Controlli di vista: chi guarda, vacanze dentro o fuori, tema, stato di sincronia.
 *
 * Il mese non si sceglie più da qui: sta in `MonthStrip`, che è una fila di
 * schede grandi come un bersaglio vero al posto di un menù a tendina.
 */

import type { ReactNode } from 'react'

import { useStore } from '../data/store'
import { PERSON_IDS, type PersonId } from '../domain/types'
import { useTheme, type ThemeMode } from '../theme/theme'
import { Segmented } from './ui'

/** Nessun login: si sceglie l'avatar e l'app ricalcola tutto sulla sua quota. */
export function PersonSwitch(): ReactNode {
  const { config, view, setPerson } = useStore()
  if (!config) return null
  return (
    <Segmented<PersonId>
      ariaLabel="Chi sta guardando"
      value={view.person}
      onChange={setPerson}
      options={PERSON_IDS.map((id) => ({
        value: id,
        title: config.people[id].name,
        label: (
          <>
            <span className="avatar" aria-hidden="true">
              {config.people[id].emoji}
            </span>
            <span>{config.people[id].name}</span>
          </>
        ),
      }))}
    />
  )
}

/**
 * Chi guarda, nella testata dell'applicazione.
 *
 * Sta qui e non nelle pagine perché è una lente **globale**: vale per ogni
 * schermata e resta scelta fra una sessione e l'altra, come il tema. Era
 * ripetuta in sei testate di pagina, e sei copie dello stesso comando sono sei
 * righe rubate al contenuto.
 *
 * Le persone sono due, quindi è un interruttore e non un menù. Su telefono
 * mostra solo l'avatar: il nome è già scritto nella riga di contesto della
 * pagina, e nella testata sarebbero cinquanta pixel spesi per ripeterlo.
 */
export function PersonButton(): ReactNode {
  const { config, view, setPerson } = useStore()
  if (!config) return null
  const current = view.person
  const next: PersonId = current === 'me' ? 'partner' : 'me'
  const label = `Stai guardando ${config.people[current].name}, tocca per passare a ${config.people[next].name}`

  return (
    <button
      type="button"
      className="btn btn-ghost person-button"
      onClick={() => setPerson(next)}
      aria-label={label}
      title={label}
    >
      <span className="avatar" aria-hidden="true">
        {config.people[current].emoji}
      </span>
      <span className="person-button-name">{config.people[current].name}</span>
    </button>
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
