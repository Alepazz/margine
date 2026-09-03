/** Controlla i dati in chiaro e stampa i totali con cui riconciliare Tricount. */

import { PATHS, exists, fail, log, readJson } from './lib/io.mjs'
import { CATEGORIES, taxonomyFingerprint } from './lib/taxonomy.mjs'
import { printReport, validateCards, validateDataset } from './lib/validate-core.mjs'

try {
  const dataset = readJson(PATHS.expenses)
  const config = readJson(PATHS.config)
  const { errors, warnings, report } = validateDataset(dataset, config)

  /* Le carte, se ci sono: un file a parte, quindi un verdetto a parte che
     confluisce nello stesso elenco. → ADR-0082 */
  if (exists(PATHS.cards)) {
    const cards = readJson(PATHS.cards)
    const verdetto = validateCards(cards)
    errors.push(...verdetto.errors)
    warnings.push(...verdetto.warnings)
    if (verdetto.errors.length === 0) {
      log(`Carte fedeltà: ${cards.cards.length}`)
    }
  }

  /*
   * Le due copie della tassonomia sono già divergite una volta, in silenzio —
   * ma da quando le categorie si modificano dall'app la divergenza è **attesa**:
   * `taxonomy.mjs` è il valore iniziale, `config.json` è lo stato corrente. Resta
   * un avviso perché il seed continua a produrre i dati di esempio da lì, e
   * sapere che i due si sono separati serve; non è più un sintomo di un errore.
   * → ADR-0024
   */
  if (taxonomyFingerprint(config.categories) !== taxonomyFingerprint(CATEGORIES)) {
    warnings.push(
      'le categorie di data/config.json non combaciano con scripts/lib/taxonomy.mjs ' +
        '(atteso se le hai cambiate dall’app): i dati di esempio del seed useranno quelle di taxonomy.mjs.',
    )
  }

  /* Senza `configPath` l'app non può committare categorie ed entrate: le
     modifica, le mostra, e non arrivano da nessuna parte. */
  if (config.github && !config.github.configPath) {
    warnings.push(
      'manca github.configPath in data/config.json: le modifiche a categorie ed entrate ' +
        'restano sul dispositivo e non finiscono nel repo.',
    )
  }

  /* Lo stesso per le carte, con un'aggravante: senza il percorso l'app non può
     nemmeno **creare** il file, quindi la pagina resta in sola lettura. */
  if (config.github && !config.github.cardsPath) {
    warnings.push(
      'manca github.cardsPath in data/config.json: le carte fedeltà si vedono ma non si ' +
        'aggiungono dall’app.',
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
