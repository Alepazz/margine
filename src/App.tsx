import type { ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from './components/AppShell'
import { Gate } from './components/Gate'
import { IdentityGate } from './components/IdentityGate'
import { useStore } from './data/store'
import { Carta } from './pages/Carta'
import { Carte } from './pages/Carte'
import { Casa } from './pages/Casa'
import { Esplora } from './pages/Esplora'
import { Gatto } from './pages/Gatto'
import { Home } from './pages/Home'
import { Impostazioni } from './pages/Impostazioni'
import { Lista } from './pages/Lista'
import { Prezzi } from './pages/Prezzi'
import { Progetto } from './pages/Progetto'
import { Saldo } from './pages/Saldo'
import { Spese } from './pages/Spese'
import { Statistiche } from './pages/Statistiche'
import { Tax730 } from './pages/Tax730'
import { Vacanze } from './pages/Vacanze'

export function App(): ReactNode {
  const { status, identity } = useStore()

  if (status !== 'ready') return <Gate />
  /* Due porte in fila: la passphrase apre i dati, l'identità dice di chi sono i
     numeri. Senza la seconda non si entra — e non c'è un ripiego, perché un
     ripiego sarebbe la vista di una persona vera. → ADR-0042 */
  if (!identity) return <IdentityGate />

  // HashRouter: su GitHub Pages non c'è un server che possa riscrivere le rotte.
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Home />} />
          <Route path="/spese" element={<Spese />} />
          <Route path="/esplora" element={<Esplora />} />
          <Route path="/casa" element={<Casa />} />
          <Route path="/gatto" element={<Gatto />} />
          <Route path="/vacanze" element={<Vacanze />} />
          {/* Generica, e il nome del progetto sta nei dati: il repo è pubblico.
              → ADR-0074, ADR-0067 */}
          <Route path="/progetto/:id" element={<Progetto />} />
          <Route path="/statistiche" element={<Statistiche />} />
          <Route path="/prezzi" element={<Prezzi />} />
          <Route path="/lista" element={<Lista />} />
          <Route path="/carte" element={<Carte />} />
          {/* Generica come quella dei progetti: il nome del negozio sta nei
              dati, non nella rotta. Il repo è pubblico. → ADR-0082, ADR-0067 */}
          <Route path="/carte/:id" element={<Carta />} />
          <Route path="/730" element={<Tax730 />} />
          <Route path="/saldo" element={<Saldo />} />
          <Route path="/impostazioni" element={<Impostazioni />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
