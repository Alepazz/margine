/**
 * Guscio: colonna laterale su schermo grande, barra in basso su telefono.
 *
 * Le destinazioni sono più dei posti disponibili in una barra, quindi hanno tre
 * case diverse. Nella **barra** stanno le quattro che si aprono ogni giorno.
 * Nel **menu `⋯`** della testata stanno le viste che si aprono di tanto in
 * tanto: le statistiche di tutta la storia, l'elenco completo delle spese e il
 * 730, che è una scena da una volta l'anno. Le **impostazioni** restano sul loro
 * ingranaggio, perché un menu che mescola viste e configurazione diventa il
 * cassetto dove finisce tutto.
 *
 * Sulla colonna laterale, dove lo spazio c'è, non si nasconde niente: il menu
 * `⋯` è una concessione al telefono, non un'architettura.
 */

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { SyncBadge, ThemeButton } from './Controls'
import { ExpenseForm } from './ExpenseForm'

type NavSlot = 'tabbar' | 'more' | 'header'

interface NavItem {
  to: string
  label: string
  glyph: string
  slot: NavSlot
}

const NAV: NavItem[] = [
  { to: '/', label: 'Riepilogo', glyph: '◧', slot: 'tabbar' },
  { to: '/casa', label: 'Casa', glyph: '🏠', slot: 'tabbar' },
  { to: '/gatto', label: 'Gatto', glyph: '🐈', slot: 'tabbar' },
  { to: '/vacanze', label: 'Vacanze', glyph: '🌍', slot: 'tabbar' },
  { to: '/statistiche', label: 'Statistiche', glyph: '📊', slot: 'more' },
  /* L'etichetta col selettore di variazione (U+FE0F): senza, `🏷` è un glifo di
     testo e il browser lo disegna come un rettangolo pallido invece dell'emoji. */
  { to: '/prezzi', label: 'Prezzi al supermercato', glyph: '🏷️', slot: 'more' },
  { to: '/spese', label: 'Tutte le spese', glyph: '≡', slot: 'more' },
  { to: '/730', label: 'Spese da 730', glyph: '🧾', slot: 'more' },
  { to: '/saldo', label: 'Saldo con chi vive con te', glyph: '⚖️', slot: 'more' },
  { to: '/impostazioni', label: 'Impostazioni', glyph: '⚙', slot: 'header' },
]

const TABBAR = NAV.filter((item) => item.slot === 'tabbar')
const MORE = NAV.filter((item) => item.slot === 'more')

/**
 * Pubblica l'altezza vera dell'isola in `--tabbar-h`, che `--tabbar-reserve` usa
 * per lo spazio in fondo alla pagina.
 *
 * Si misura invece di calcolarla perché è emergente: la decidono glifo,
 * etichetta e scala del carattere, non il `min-height` del link — un `calc` in
 * CSS la sbagliava di 6px, e le ultime righe della pagina finivano sotto il
 * vetro. Con la misura resta esatta anche quando l'isola cambierà (il pulsante
 * al centro) o quando cambierà la scala del carattere.
 */
function useTabbarHeight(): RefObject<HTMLElement | null> {
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const island = ref.current
    if (!island) return
    const root = document.documentElement
    const publish = () => root.style.setProperty('--tabbar-h', `${island.offsetHeight}px`)
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(island)
    return () => {
      observer.disconnect()
      // Torna al valore di partenza del foglio di stile invece di lasciare
      // appiccicato quello dell'ultima misura.
      root.style.removeProperty('--tabbar-h')
    }
  }, [])

  return ref
}

function Brand(): ReactNode {
  return (
    <div className="brand">
      <span className="brand-rule" aria-hidden="true" />
      <div>
        <div className="brand-name">Margine</div>
        <div className="brand-sub">spese e statistiche</div>
      </div>
    </div>
  )
}

/** Le viste che non stanno nella barra, in un foglio dal basso. */
function MoreMenu({ onClose }: { onClose: () => void }): ReactNode {
  const sheet = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    sheet.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="sheet-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Altre viste"
        tabIndex={-1}
        ref={sheet}
      >
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <h2 style={{ fontSize: '1.15rem' }}>Altre viste</h2>
          <button type="button" className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Chiudi">
            ✕
          </button>
        </div>
        <nav className="menu-list">
          {MORE.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `menu-item${isActive ? ' is-active' : ''}`}
              onClick={onClose}
            >
              <span className="menu-glyph" aria-hidden="true">
                {item.glyph}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}

export function AppShell(): ReactNode {
  const tabbar = useTabbarHeight()
  const [moreOpen, setMoreOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const { pathname } = useLocation()

  /* Un cambio di rotta da fuori il menu (un link nel corpo della pagina) non
     deve lasciare il foglio aperto sopra la pagina nuova. */
  useEffect(() => setMoreOpen(false), [pathname])

  const onMoreRoute = MORE.some((item) => item.to === pathname)

  const tab = (item: NavItem): ReactNode => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) => `tabbar-link${isActive ? ' is-active' : ''}`}
    >
      <span className="tabbar-glyph" aria-hidden="true">
        {item.glyph}
      </span>
      {item.label}
    </NavLink>
  )

  return (
    <div className="app">
      <aside className="sidebar">
        <Brand />
        {/* Su schermo grande l'isola non c'è: l'azione trova posto qui. */}
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          + Aggiungi una spesa
        </button>
        <nav className="nav" aria-label="Sezioni">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
            >
              <span className="nav-glyph" aria-hidden="true">
                {item.glyph}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <SyncBadge />
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-brand">
            <Brand />
          </div>
          <div className="topbar-spacer" />
          <SyncBadge />
          <ThemeButton />
          {/* Solo su telefono: sulla colonna laterale queste voci si vedono già. */}
          <button
            type="button"
            className={`btn btn-icon btn-ghost topbar-more${onMoreRoute ? ' is-active' : ''}`}
            aria-label="Altre viste"
            aria-expanded={moreOpen}
            title="Altre viste"
            onClick={() => setMoreOpen(true)}
          >
            <span aria-hidden="true">⋯</span>
          </button>
          <NavLink
            to="/impostazioni"
            className="btn btn-icon btn-ghost"
            aria-label="Impostazioni"
            title="Impostazioni"
          >
            <span aria-hidden="true">⚙</span>
          </NavLink>
        </header>

        <div className="content">
          <Outlet />
        </div>
      </div>

      {/*
        Due voci, il pulsante, due voci. Il «+» sta al centro perché è l'unica
        azione fra cose che sono tutte navigazione, e perché al centro il pollice
        ci arriva da entrambe le mani.
      */}
      <nav className="tabbar" aria-label="Sezioni" ref={tabbar}>
        {TABBAR.slice(0, 2).map(tab)}
        <button
          type="button"
          className="tabbar-add"
          onClick={() => setAdding(true)}
          aria-label="Aggiungi una spesa"
          title="Aggiungi una spesa"
        >
          <span aria-hidden="true">+</span>
        </button>
        {TABBAR.slice(2).map(tab)}
      </nav>

      {moreOpen ? <MoreMenu onClose={() => setMoreOpen(false)} /> : null}
      {adding ? <ExpenseForm onClose={() => setAdding(false)} /> : null}
    </div>
  )
}
