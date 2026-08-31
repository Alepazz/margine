/**
 * Guscio: colonna laterale su schermo grande, isola fluttuante su telefono.
 *
 * L'app ha **due scopi** — il tricount con le sue statistiche, e i prezzi al
 * supermercato — e la barra li serve entrambi: Riepilogo e Spese per il primo,
 * Prezzi per il secondo, che prima stava in fondo a un menù nella testata, cioè
 * nel posto più lontano dal pollice per l'attività che si fa in piedi col
 * carrello. La quinta voce, **Esplora**, è una pagina con le anteprime e non un
 * menù: è ciò che rende accettabile aver spostato Casa, Gatto e Vacanze da un
 * tocco a due. → ADR-0044
 *
 * Sulla colonna laterale non si nasconde niente: le voci ci stanno tutte, e
 * Esplora non compare — l'hub è una concessione al telefono, non
 * un'architettura.
 */

import { useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

import { useReadyStore } from '../data/store'
import { badgeLabel } from '../domain/changes'
import { projectsOf, type Tricount } from '../domain/types'
import { SyncBadge, ThemeButton } from './Controls'
import { ExpenseForm } from './ExpenseForm'
import { NewsSheet } from './NewsSheet'
import { PriceSheet } from './PriceSheet'

/** I due gruppi dell'hub e della colonna. Le voci di barra non ne hanno. */
type NavGroup = 'raccolte' | 'analisi'

interface NavBase {
  to: string
  label: string
  glyph: string
}

/**
 * Dove vive una voce: nell'isola, dentro l'hub, o sull'ingranaggio della
 * testata. Le voci `hub` non stanno nell'isola ma **sono in colonna**: è la
 * stessa lista, mostrata in due modi.
 *
 * Il gruppo è obbligatorio per le voci dell'hub e assente per le altre, e lo
 * dice il tipo perché la colonna scorre i gruppi: una voce dell'hub che restasse
 * senza sparirebbe **in silenzio** da lì — raggiungibile per URL, invisibile in
 * navigazione — e nessun test la coglierebbe. Con l'unione discriminata non
 * compila.
 */
type NavItem =
  | (NavBase & { slot: 'tabbar' | 'header'; group?: never })
  | (NavBase & { slot: 'hub'; group: NavGroup })

/** La rotta su cui il `+` registra un prezzo invece di aggiungere una spesa. */
const PRICE_ROUTE = '/prezzi'
/** L'hub: il `+` non la guarda, ma la barra e il link di ritorno sì. */
const HUB_ROUTE = '/esplora'
/**
 * Le rotte dei progetti. Sono l'unica famiglia di viste **dell'hub che non sta
 * in `NAV`**, e non poteva starci: i progetti nascono dai dati, e `NAV` è una
 * lista scritta a mano. Il prezzo è che le due cose che `NAV` garantisce vanno
 * rifatte qui a mano — la voce accesa nella barra e la presenza in colonna — ed
 * è per questo che stanno tutte e due in questo file e non nelle pagine.
 * → ADR-0074, ADR-0044
 */
const PROJECT_PREFIX = '/progetto/'
/** La raccolta della casa: il suo nome viene dai dati, non da `NAV`. */
const HOUSE_ROUTE = '/casa'

/** La voce di colonna e di hub di un progetto, dal tricount. */
function projectItem(tricount: Tricount): NavItem {
  return {
    to: `${PROJECT_PREFIX}${tricount.id}`,
    label: tricount.name,
    glyph: tricount.emoji ?? '🏗️',
    slot: 'hub',
    group: 'raccolte',
  }
}

const NAV: NavItem[] = [
  /* Emoji come tutte le altre voci: `◧` e `≡` erano glifi tipografici, e in una
     barra dove tutto il resto è a colori sembravano due voci spente. */
  { to: '/', label: 'Riepilogo', glyph: '💰', slot: 'tabbar' },
  { to: '/spese', label: 'Spese', glyph: '📋', slot: 'tabbar' },
  /* L'etichetta col selettore di variazione (U+FE0F): senza, `🏷` è un glifo di
     testo e il browser lo disegna come un rettangolo pallido invece dell'emoji. */
  { to: '/prezzi', label: 'Prezzi', glyph: '🏷️', slot: 'tabbar' },
  { to: HUB_ROUTE, label: 'Esplora', glyph: '🧭', slot: 'tabbar' },
  { to: '/casa', label: 'Casa', glyph: '🏠', slot: 'hub', group: 'raccolte' },
  { to: '/gatto', label: 'Il gatto', glyph: '🐈', slot: 'hub', group: 'raccolte' },
  { to: '/vacanze', label: 'Vacanze', glyph: '🌍', slot: 'hub', group: 'raccolte' },
  { to: '/statistiche', label: 'Statistiche', glyph: '📊', slot: 'hub', group: 'analisi' },
  { to: '/730', label: 'Spese da 730', glyph: '🧾', slot: 'hub', group: 'analisi' },
  { to: '/saldo', label: 'Saldo', glyph: '⚖️', slot: 'hub', group: 'analisi' },
  { to: '/impostazioni', label: 'Impostazioni', glyph: '⚙', slot: 'header' },
]

const TABBAR = NAV.filter((item) => item.slot === 'tabbar')
const HUB = NAV.filter((item) => item.slot === 'hub')
/** Le rotte dentro l'hub: su di esse la voce «Esplora» resta accesa. */
const HUB_ROUTES = new Set(HUB.map((item) => item.to))

/** Sei dentro «Esplora»? I progetti ci stanno, anche se non sono in `NAV`. */
function inHub(pathname: string): boolean {
  return HUB_ROUTES.has(pathname) || pathname.startsWith(PROJECT_PREFIX)
}

/* L'ordine dei gruppi vive qui e solo qui: la colonna li scorre da questo
   oggetto invece di riscriverne i nomi in JSX. */
const GROUPS: [NavGroup, string][] = [
  ['raccolte', 'Raccolte'],
  ['analisi', 'Analisi'],
]

/*
 * Qui viveva `useTabbarHeight`, che misurava l'isola con un ResizeObserver e
 * pubblicava `--tabbar-h` perché la pagina si riservasse in fondo il suo
 * ingombro esatto. Non serve più a niente: da ADR-0048 l'isola è l'ultima riga
 * del guscio invece di un elemento fisso sopra il contenuto, quindi non copre
 * nulla e non c'è nessuno spazio da riservare. Se un giorno l'isola tornasse
 * `fixed`, tornerebbe anche il bisogno di misurarla — e con esso il difetto che
 * ADR-0048 ha tolto.
 */

function Brand(): ReactNode {
  return (
    <div className="brand">
      <span className="brand-rule" aria-hidden="true" />
      <div>
        <div className="brand-name">Margine</div>
        {/* I due scopi, non uno: era «spese e statistiche» da prima dei prezzi. */}
        <div className="brand-sub">spese e prezzi</div>
      </div>
    </div>
  )
}

/**
 * La campanella, col numero di novità non viste.
 *
 * Il pallino lo azzera **solo** l'apertura del foglio, non l'apertura dell'app:
 * `markNewsSeen` sta dentro `NewsSheet`. E il numero si ferma a `9+` — oltre,
 * la cifra esatta non cambia quello che fai.
 *
 * Sta nella testata e non nella barra in fondo perché la barra serve i due
 * scopi dell'app (→ ADR-0044) e questa non è né consultare né registrare: è la
 * cornice, dove stanno già stato di sincronizzazione, tema e impostazioni.
 */
function NewsButton({ onOpen }: { onOpen: () => void }): ReactNode {
  const { news } = useReadyStore()
  const label = badgeLabel(news.unseen)
  return (
    <button
      type="button"
      className="btn btn-icon btn-ghost news-btn"
      onClick={onOpen}
      aria-label={news.unseen > 0 ? `Novità: ${String(news.unseen)} da vedere` : 'Novità'}
      title="Novità"
    >
      <span aria-hidden="true">🔔</span>
      {label ? (
        <span className="news-badge" aria-hidden="true">
          {label}
        </span>
      ) : null}
    </button>
  )
}

export function AppShell(): ReactNode {
  /** Cosa si sta aggiungendo. Il `+` è uno, i verbi sono due. */
  const [adding, setAdding] = useState<'expense' | 'price' | null>(null)
  const [newsOpen, setNewsOpen] = useState(false)
  const { pathname } = useLocation()
  const { config, dataset } = useReadyStore()
  const projects = projectsOf(dataset.tricounts)
  /*
   * «Casa» in `NAV` è l'unica etichetta scritta a mano che due tricount possono
   * contendersi: da quando esiste un progetto che si chiama anche lui «Casa …»
   * (→ ADR-0074) la voce prende il nome dal tricount di casa, come fanno la sua
   * pagina e la sua scheda nell'hub. Il nome sta nei dati e non qui perché il
   * repo è pubblico. → ADR-0026, ADR-0067
   */
  const houseName = dataset.tricounts.find((t) => t.id === config.houseTricount)?.name
  const named = (item: NavItem): NavItem =>
    item.to === HOUSE_ROUTE && houseName ? { ...item, label: houseName } : item

  const addsPrice = pathname === PRICE_ROUTE
  const addLabel = addsPrice ? 'Registra un prezzo' : 'Aggiungi una spesa'

  const tab = (item: NavItem): ReactNode => {
    /* «Esplora» resta acceso anche dentro le sue sei viste: sei lì dentro, e una
       barra che si spegne tutta non dice più dove sei. */
    const litByHub = item.to === HUB_ROUTE && inHub(pathname)
    const body = (
      <>
        <span className="tabbar-glyph" aria-hidden="true">
          {item.glyph}
        </span>
        {item.label}
      </>
    )

    /*
     * In quel caso serve un `Link` e non un `NavLink`: `NavLink` applica
     * `aria-current` **solo** quando la rotta è la sua, quindi passarglielo da
     * fuori non fa niente — provato, l'attributo non compariva. Senza, chi
     * naviga con la voce su `/casa` non riceve l'unica informazione per cui
     * quella riga esiste: che sei dentro Esplora.
     */
    if (litByHub) {
      return (
        <Link key={item.to} to={item.to} className="tabbar-link is-active" aria-current="page">
          {body}
        </Link>
      )
    }

    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.to === '/'}
        className={({ isActive }) => `tabbar-link${isActive ? ' is-active' : ''}`}
      >
        {body}
      </NavLink>
    )
  }

  const sideLink = (item: NavItem): ReactNode => (
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
  )

  return (
    <div className="app">
      <aside className="sidebar">
        <Brand />
        {/* Su schermo grande l'isola non c'è: le due azioni trovano posto qui,
            entrambe, invece di dipendere dalla pagina aperta. */}
        <div className="stack" style={{ gap: 6 }}>
          <button type="button" className="btn btn-primary" onClick={() => setAdding('expense')}>
            + Aggiungi una spesa
          </button>
          <button type="button" className="btn" onClick={() => setAdding('price')}>
            + Registra un prezzo
          </button>
        </div>
        <nav className="nav" aria-label="Sezioni">
          {/* Le tre viste di ogni giorno, poi i due gruppi dell'hub: la colonna
              mostra la stessa lista che il telefono mette dietro «Esplora»,
              senza l'hub in mezzo. */}
          {TABBAR.filter((item) => item.to !== HUB_ROUTE).map(sideLink)}
          {GROUPS.map(([group, label]) => (
            <div className="nav-group" key={group}>
              <div className="nav-group-title">{label}</div>
              {HUB.filter((item) => item.group === group).map(named).map(sideLink)}
              {/* I progetti, che nascono dai dati e non da `NAV`. Sono qui e non
                  in un gruppo loro perché sono raccolte come Casa e il gatto: un
                  gruppo che compare solo quando c'è un progetto sposterebbe le
                  altre voci sotto il pollice a ogni creazione. → ADR-0074 */}
              {group === 'raccolte' ? projects.map(projectItem).map(sideLink) : null}
            </div>
          ))}
          {NAV.filter((item) => item.slot === 'header').map(sideLink)}
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
          <NewsButton onOpen={() => setNewsOpen(true)} />
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
          {/*
            La via del ritorno, dentro le sei viste dell'hub. La rende il guscio
            e non le pagine: è lui che sa quali rotte stanno dentro «Esplora»
            (`HUB_ROUTES`), quindi sei pagine non possono divergere dalla barra
            il giorno che una voce cambia posto. Su schermo grande spare — là ci
            si arriva dalla colonna, e un «indietro» punterebbe a una pagina che
            non si è attraversata.
          */}
          {inHub(pathname) ? (
            <NavLink to={HUB_ROUTE} className="hub-back">
              <span aria-hidden="true">‹</span> Esplora
            </NavLink>
          ) : null}
          <Outlet />
        </div>
      </div>

      {/*
        Due voci, il pulsante, due voci. Il «+» sta al centro perché è l'unica
        azione fra cose che sono tutte navigazione, e perché al centro il pollice
        ci arriva da entrambe le mani. Aggiunge **la cosa della pagina in cui
        sei**: un foglio di scelta costerebbe un tocco su ogni spesa per
        risparmiarne uno sui prezzi, e il rapporto d'uso va al contrario.
      */}
      <nav className="tabbar" aria-label="Sezioni">
        {TABBAR.slice(0, 2).map(tab)}
        <button
          type="button"
          className="tabbar-add"
          onClick={() => setAdding(addsPrice ? 'price' : 'expense')}
          aria-label={addLabel}
          title={addLabel}
        >
          <span aria-hidden="true">+</span>
        </button>
        {TABBAR.slice(2).map(tab)}
      </nav>

      {adding === 'expense' ? <ExpenseForm onClose={() => setAdding(null)} /> : null}
      {adding === 'price' ? <PriceSheet onClose={() => setAdding(null)} /> : null}
      {newsOpen ? <NewsSheet onClose={() => setNewsOpen(false)} /> : null}
    </div>
  )
}
