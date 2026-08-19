/** Controlli di vista: chi guarda, quale mese, vacanze dentro o fuori, tema, stato di sincronia. */

import type { ReactNode } from 'react'

import { useStore } from '../data/store'
import { monthLabel } from '../domain/dates'
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

export function MonthPicker(): ReactNode {
  const { months, month, setMonth } = useStore()
  if (months.length === 0) return null
  const index = months.indexOf(month)

  return (
    <div className="row month-picker" style={{ gap: 4 }}>
      <button
        type="button"
        className="btn btn-icon btn-ghost"
        aria-label="Mese precedente"
        disabled={index <= 0}
        onClick={() => {
          const prev = months[index - 1]
          if (prev) setMonth(prev)
        }}
      >
        ‹
      </button>
      <label className="sr-only" htmlFor="month-select">
        Mese
      </label>
      <select
        id="month-select"
        className="select"
        style={{ width: 'auto', minWidth: 140 }}
        value={month}
        onChange={(event) => setMonth(event.target.value)}
      >
        {[...months].reverse().map((m) => (
          <option key={m} value={m}>
            {monthLabel(m)}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-icon btn-ghost"
        aria-label="Mese successivo"
        disabled={index < 0 || index >= months.length - 1}
        onClick={() => {
          const next = months[index + 1]
          if (next) setMonth(next)
        }}
      >
        ›
      </button>
    </div>
  )
}

/**
 * Le vacanze restano fuori dalle statistiche mensili: una settimana di viaggio
 * non deve far sembrare fuori media un mese normale.
 */
export function VacationToggle(): ReactNode {
  const { view, setIncludeVacations } = useStore()
  return (
    <Segmented<'off' | 'on'>
      ariaLabel="Vacanze nelle statistiche"
      value={view.includeVacations ? 'on' : 'off'}
      onChange={(value) => setIncludeVacations(value === 'on')}
      options={[
        { value: 'off', label: 'Senza vacanze', title: 'Le spese di viaggio restano fuori' },
        { value: 'on', label: 'Con vacanze', title: 'Includi le spese di viaggio' },
      ]}
    />
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
