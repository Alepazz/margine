/** Tema: automatico (impostazione di sistema), chiaro o scuro forzato. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { DARK_CHART, LIGHT_CHART, type ChartTheme } from './palette'

export type ThemeMode = 'auto' | 'light' | 'dark'

const STORAGE_KEY = 'margine.theme.v1'

interface ThemeApi {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  isDark: boolean
  chart: ChartTheme
}

const ThemeContext = createContext<ThemeApi | null>(null)

function readMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'auto') return raw
  } catch {
    /* niente storage: resta automatico */
  }
  return 'auto'
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ThemeProvider({ children }: { children: ReactNode }): ReactNode {
  const [mode, setModeState] = useState<ThemeMode>(readMode)
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark)

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (mode === 'auto') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', mode)
  }, [mode])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignora */
    }
  }, [])

  const isDark = mode === 'dark' || (mode === 'auto' && systemDark)

  const api = useMemo<ThemeApi>(
    () => ({ mode, setMode, isDark, chart: isDark ? DARK_CHART : LIGHT_CHART }),
    [isDark, mode, setMode],
  )

  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeApi {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme va usato dentro <ThemeProvider>.')
  return ctx
}

export function useChartTheme(): ChartTheme {
  return useTheme().chart
}
