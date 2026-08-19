/**
 * Valida i dati in chiaro e li pubblica cifrati in `public/data/`.
 *
 * I due file usano lo stesso salt di derivazione: nell'app la chiave si calcola
 * una volta sola invece di due (600.000 iterazioni non sono gratuite su un
 * telefono).
 */

import { statSync } from 'node:fs'

import { deriveKey, encryptEnvelope, newKdfMeta } from './crypto-node.mjs'
import { PATHS, ensureDir, log, readJson, readPassphrase, writeJson } from './io.mjs'
import { printReport, validateDataset } from './validate-core.mjs'

export async function publish({ silent = false } = {}) {
  const dataset = readJson(PATHS.expenses)
  const config = readJson(PATHS.config)
  const { errors, warnings, report } = validateDataset(dataset, config)

  if (!silent) {
    for (const warning of warnings) log(`⚠ ${warning}`)
  }
  if (errors.length > 0) {
    for (const error of errors.slice(0, 40)) log(`✗ ${error}`)
    if (errors.length > 40) log(`… e altri ${errors.length - 40} errori`)
    return { ok: false, errors, warnings, report }
  }

  const passphrase = readPassphrase()
  const kdf = newKdfMeta()
  const key = await deriveKey(passphrase, kdf)

  ensureDir(PATHS.publicData)
  writeJson(PATHS.expensesEnc, await encryptEnvelope(dataset, key, kdf))
  writeJson(PATHS.configEnc, await encryptEnvelope(config, key, kdf))

  if (!silent) {
    const size = (path) => `${(statSync(path).size / 1024).toFixed(1)} kB`
    log('')
    log(`✓ public/data/expenses.json.enc  (${size(PATHS.expensesEnc)})`)
    log(`✓ public/data/config.json.enc    (${size(PATHS.configEnc)})`)
    printReport(report, log)
  }

  return { ok: true, errors, warnings, report }
}
