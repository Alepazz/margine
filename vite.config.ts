import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base relativo: la stessa build funziona in locale, su GitHub Pages di progetto
// (/margine/) e su un eventuale dominio custom, senza ricompilare.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    // I dati cifrati vengono serviti come asset statici da public/data/
    assetsInlineLimit: 0,
  },
})
