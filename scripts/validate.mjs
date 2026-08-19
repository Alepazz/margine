/** Controlla i dati in chiaro e stampa i totali con cui riconciliare Tricount. */

import { PATHS, fail, log, readJson } from './lib/io.mjs'
import { CATEGORIES, taxonomyFingerprint } from './lib/taxonomy.mjs'
import { printReport, validateDataset } from './lib/validate-core.mjs'

try {
  const dataset = readJson(PATHS.expenses)
  const config = readJson(PATHS.config)
  const { errors, warnings, report } = validateDataset(dataset, config)

  /* Le due copie della tassonomia sono già divergite una volta, in silenzio. */
  if (taxonomyFingerprint(config.categories) !== taxonomyFingerprint(CATEGORIES)) {
    warnings.push(
      'la tassonomia di data/config.json non combacia con scripts/lib/taxonomy.mjs: ' +
        'il seed produrrà categorie diverse da quelle dei dati veri.',
    )
  }

  for (const warning of warnings) log(`⚠ ${warning}`)
  for (const error of errors) log(`✗ ${error}`)

  printReport(report, log)

  log('')
  if (errors.length === 0) {
    log(`✓ Dati validi${warnings.length > 0 ? ` (${warnings.length} avvisi)` : ''}`)
  } else {
    fail(`${errors.length} errori da sistemare prima di cifrare.`)
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
