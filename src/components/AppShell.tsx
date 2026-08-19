/** Guscio: navigazione laterale su schermo grande, barra in basso su telefono. */

import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

import { SyncBadge, ThemeButton } from './Controls'

interface NavItem {
  to: string
  label: string
  glyph: string
  inTabbar: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Riepilogo', glyph: '◧', inTabbar: true },
  { to: '/spese', label: 'Spese', glyph: '≡', inTabbar: true },
  { to: '/gatto', label: 'Gatto', glyph: '🐈', inTabbar: true },
  { to: '/vacanze', label: 'Vacanze', glyph: '🌍', inTabbar: true },
  { to: '/730', label: '730', glyph: '🧾', inTabbar: true },
  { to: '/impostazioni', label: 'Impostazioni', glyph: '⚙', inTabbar: false },
]

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

export function AppShell(): ReactNode {
  return (
    <div className="app">
      <aside className="sidebar">
        <Brand />
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

      <nav className="tabbar" aria-label="Sezioni">
        {NAV.filter((item) => item.inTabbar).map((item) => (
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
        ))}
      </nav>
    </div>
  )
}
