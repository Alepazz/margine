/**
 * Ricostruisce i dati in chiaro dai file cifrati.
 *
 * Serve in due casi: hai cambiato Mac e vuoi ripartire dal repo, oppure l'app ha
 * scritto annotazioni 730 che il tuo master locale non ha ancora.
 * Sovrascrive `data/` solo con `--yes`.
 */

import { assertEnvelope, decryptEnvelope, deriveKey } from './lib/crypto-node.mjs'
import { PATHS, exists, fail, log, readJson, readPassphrase, writeJson } from './lib/io.mjs'

const force = process.argv.includes('--yes')

try {
  if (!exists(PATHS.expensesEnc)) throw new Error(`Non trovo ${PATHS.expensesEnc}`)

  if (!force && (exists(PATHS.expenses) || exists(PATHS.config))) {
    log('data/ contiene già dei file in chiaro.')
    log('Rilancia con --yes per sovrascriverli con quelli del repo:')
    log('  npm run decrypt -- --yes')
    process.exitCode = 1
  } else {
    const passphrase = readPassphrase()
    const datasetEnvelope = assertEnvelope(readJson(PATHS.expensesEnc), PATHS.expensesEnc)
    const key = await deriveKey(passphrase, datasetEnvelope.kdf)
    const dataset = await decryptEnvelope(datasetEnvelope, key)
    writeJson(PATHS.expenses, dataset)
    log(`✓ data/expenses.json — ${dataset.expenses.length} spese, ${dataset.trips.length} viaggi`)

    if (exists(PATHS.configEnc)) {
      const configEnvelope = assertEnvelope(readJson(PATHS.configEnc), PATHS.configEnc)
      const configKey =
        configEnvelope.kdf.salt === datasetEnvelope.kdf.salt &&
        configEnvelope.kdf.iterations === datasetEnvelope.kdf.iterations
          ? key
          : await deriveKey(passphrase, configEnvelope.kdf)
      writeJson(PATHS.config, await decryptEnvelope(configEnvelope, configKey))
      log('✓ data/config.json')
    }
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
