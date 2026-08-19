import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { ToastProvider } from './components/ui'
import { StoreProvider } from './data/store'
import { ThemeProvider } from './theme/theme'

/*
 * Font self-hosted, come negli altri progetti: niente richieste a Google Fonts
 * (un dato in meno che esce, e una dipendenza esterna in meno al caricamento).
 */
import '@fontsource-variable/bricolage-grotesque/wght.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'

import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'

const container = document.getElementById('root')
if (!container) throw new Error('Manca #root in index.html')

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <StoreProvider>
          <App />
        </StoreProvider>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
)
