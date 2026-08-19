/** Cifra i dati in chiaro di `data/` in `public/data/`. */

import { fail, log } from './lib/io.mjs'
import { publish } from './lib/publish.mjs'

try {
  const result = await publish()
  if (!result.ok) fail('Dati non validi: niente è stato cifrato.')
  else log('')
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
