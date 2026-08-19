import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Anche gli script: la validazione dell'import è dove vivono gli invarianti.
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
  },
})
