/** Percorsi, lettura/scrittura JSON e recupero della passphrase. */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(here, '..', '..')

export const PATHS = {
  root: ROOT,
  data: join(ROOT, 'data'),
  dataExample: join(ROOT, 'data-example'),
  incoming: join(ROOT, 'data', 'incoming'),
  publicData: join(ROOT, 'public', 'data'),
  secrets: join(ROOT, '.secrets'),
  passphraseFile: join(ROOT, '.secrets', 'passphrase'),
  expenses: join(ROOT, 'data', 'expenses.json'),
  config: join(ROOT, 'data', 'config.json'),
  expensesEnc: join(ROOT, 'public', 'data', 'expenses.json.enc'),
  configEnc: join(ROOT, 'public', 'data', 'config.json.enc'),
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true })
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function writeJson(path, value) {
  ensureDir(dirname(path))
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export function exists(path) {
  return existsSync(path)
}

/**
 * Passphrase da `MARGINE_PASSPHRASE` o da `.secrets/passphrase` (fuori da git).
 * Niente valori di ripiego: cifrare con una passphrase implicita sarebbe peggio
 * che non cifrare, perché darebbe l'illusione della protezione.
 */
export function readPassphrase() {
  const fromEnv = process.env.MARGINE_PASSPHRASE
  if (fromEnv && fromEnv.trim() !== '') return fromEnv.trim()
  if (existsSync(PATHS.passphraseFile)) {
    const fromFile = readFileSync(PATHS.passphraseFile, 'utf8').trim()
    if (fromFile !== '') return fromFile
  }
  throw new Error(
    'Passphrase non trovata. Impostala con MARGINE_PASSPHRASE=... oppure scrivila in .secrets/passphrase (che è fuori da git).',
  )
}

export function log(message) {
  process.stdout.write(`${message}\n`)
}

export function fail(message) {
  process.stderr.write(`✗ ${message}\n`)
  process.exitCode = 1
}
