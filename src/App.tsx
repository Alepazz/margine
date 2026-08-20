import type { ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from './components/AppShell'
import { Gate } from './components/Gate'
import { useStore } from './data/store'
import { Casa } from './pages/Casa'
import { Gatto } from './pages/Gatto'
import { Home } from './pages/Home'
import { Impostazioni } from './pages/Impostazioni'
import { Saldo } from './pages/Saldo'
import { Spese } from './pages/Spese'
import { Tax730 } from './pages/Tax730'
import { Vacanze } from './pages/Vacanze'

export function App(): ReactNode {
  const { status } = useStore()

  if (status !== 'ready') return <Gate />

  // HashRouter: su GitHub Pages non c'è un server che possa riscrivere le rotte.
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Home />} />
          <Route path="/spese" element={<Spese />} />
          <Route path="/casa" element={<Casa />} />
          <Route path="/gatto" element={<Gatto />} />
          <Route path="/vacanze" element={<Vacanze />} />
          <Route path="/730" element={<Tax730 />} />
          <Route path="/saldo" element={<Saldo />} />
          <Route path="/impostazioni" element={<Impostazioni />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
