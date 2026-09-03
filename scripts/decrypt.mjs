/**
 * Ricostruisce i dati in chiaro dai file cifrati.
 *
 * Serve in due casi: hai cambiato Mac e vuoi ripartire dal repo, oppure l'app ha
 * scritto qualcosa che il tuo master locale non ha ancora.
 * Sovrascrive `data/` solo con `--yes`.
 *
 * **Prima si decifra tutto, poi si scrive.** L'ordine non è pignoleria: fino al
 * 31/08/2026 questo script scriveva le spese, poi leggeva un campo che non
 * esisteva più, e lanciava — lasciando `data/` a metà, con un messaggio che
 * sembrava un guasto della cifratura. Con i file diventati quattro il rischio
 * cresce con loro, quindi la scrittura è l'ultima cosa che succede.
 */

import { assertEnvelope, decryptEnvelope, deriveKey } from './lib/crypto-node.mjs'
import { PATHS, exists, fail, log, readJson, readPassphrase, writeJson } from './lib/io.mjs'

const force = process.argv.includes('--yes')

try {
  if (!exists(PATHS.expensesEnc)) throw new Error(`Non trovo ${PATHS.expensesEnc}`)

  if (
    !force &&
    (exists(PATHS.expenses) ||
      exists(PATHS.config) ||
      exists(PATHS.cards) ||
      exists(PATHS.shopping))
  ) {
    log('data/ contiene già dei file in chiaro.')
    log('Rilancia con --yes per sovrascriverli con quelli del repo:')
    log('  npm run decrypt -- --yes')
    process.exitCode = 1
  } else {
    const passphrase = readPassphrase()

    const datasetEnvelope = assertEnvelope(readJson(PATHS.expensesEnc), PATHS.expensesEnc)
    const key = await deriveKey(passphrase, datasetEnvelope.kdf)
    /* La chiave si riusa quando i parametri coincidono, che è il caso normale:
       `publish.mjs` cifra i file con lo stesso salt apposta. */
    const keyFor = async (envelope) =>
      envelope.kdf.salt === datasetEnvelope.kdf.salt &&
      envelope.kdf.iterations === datasetEnvelope.kdf.iterations
        ? key
        : deriveKey(passphrase, envelope.kdf)

    const dataset = await decryptEnvelope(datasetEnvelope, key)

    let config
    if (exists(PATHS.configEnc)) {
      const envelope = assertEnvelope(readJson(PATHS.configEnc), PATHS.configEnc)
      config = await decryptEnvelope(envelope, await keyFor(envelope))
    }

    /* Le carte possono non esserci: chi non le usa non ha il file. → ADR-0082 */
    let cards
    if (exists(PATHS.cardsEnc)) {
      const envelope = assertEnvelope(readJson(PATHS.cardsEnc), PATHS.cardsEnc)
      cards = await decryptEnvelope(envelope, await keyFor(envelope))
    }

    /* La lista della spesa, come le carte: può non esserci. → ADR-0088 */
    let shopping
    if (exists(PATHS.shoppingEnc)) {
      const envelope = assertEnvelope(readJson(PATHS.shoppingEnc), PATHS.shoppingEnc)
      shopping = await decryptEnvelope(envelope, await keyFor(envelope))
    }

    writeJson(PATHS.expenses, dataset)
    const viaggi = dataset.tricounts.filter((tricount) => tricount.trip).length
    log(`✓ data/expenses.json — ${dataset.expenses.length} spese, ${viaggi} viaggi`)
    if (config !== undefined) {
      writeJson(PATHS.config, config)
      log('✓ data/config.json')
    }
    if (cards !== undefined) {
      writeJson(PATHS.cards, cards)
      log(`✓ data/cards.json — ${cards.cards.length} carte`)
    }
    if (shopping !== undefined) {
      writeJson(PATHS.shopping, shopping)
      log(`✓ data/shopping.json — ${shopping.items.length} voci in lista`)
    }
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
