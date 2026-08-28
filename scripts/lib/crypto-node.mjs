/**
 * Stessa cifratura del browser (AES-256-GCM + PBKDF2-SHA256), lato Node.
 *
 * Il formato dell'envelope è identico a `src/data/envelope.ts`: un test in
 * `src/data/crypto.test.ts` cifra qui e decifra là, così le due implementazioni
 * non possono divergere in silenzio.
 */

import { webcrypto } from 'node:crypto'

const { subtle } = webcrypto

export const DEFAULT_ITERATIONS = 600_000
/* Gli stessi limiti di `src/data/envelope.ts`: le due implementazioni scrivono lo
   stesso formato, quindi devono anche rifiutare le stesse cose. → ADR-0073 */
export const MIN_ITERATIONS = 100_000
export const MAX_ITERATIONS = 5_000_000
export const SALT_BYTES = 16
export const IV_BYTES = 12

/**
 * Lancia se questo non è un envelope che Margine potrebbe aver scritto.
 *
 * Lancia invece di tornare un booleano perché gli script hanno un solo modo utile
 * di reagire — fermarsi e dirlo — e un `if` in più in ogni chiamante sarebbe un
 * `if` in meno prima o poi. Il messaggio nomina il campo, perché chi lo legge sta
 * guardando un file e vuole sapere quale riga non torna.
 */
export function assertEnvelope(value, dove) {
  const dice = (che) => {
    throw new Error(`${dove} non è un file cifrato di Margine: ${che}.`)
  }
  if (typeof value !== 'object' || value === null) dice('non è un oggetto')
  if (value.v !== 1) dice(`versione del formato inattesa (${String(value.v)})`)
  const kdf = value.kdf
  if (typeof kdf !== 'object' || kdf === null) dice('manca `kdf`')
  if (kdf.name !== 'PBKDF2') dice(`derivazione inattesa (${String(kdf.name)})`)
  if (kdf.hash !== 'SHA-256') dice(`digest inatteso (${String(kdf.hash)})`)
  if (typeof kdf.salt !== 'string' || fromBase64(kdf.salt).length !== SALT_BYTES) {
    dice(`il salt non è di ${String(SALT_BYTES)} byte`)
  }
  if (!Number.isInteger(kdf.iterations) || kdf.iterations < MIN_ITERATIONS || kdf.iterations > MAX_ITERATIONS) {
    dice(
      `iterazioni fuori dai limiti (${String(kdf.iterations)}, attese fra ` +
        `${String(MIN_ITERATIONS)} e ${String(MAX_ITERATIONS)})`,
    )
  }
  const cipher = value.cipher
  if (typeof cipher !== 'object' || cipher === null) dice('manca `cipher`')
  if (cipher.name !== 'AES-GCM') dice(`cifratura inattesa (${String(cipher.name)})`)
  if (typeof cipher.iv !== 'string' || fromBase64(cipher.iv).length !== IV_BYTES) {
    dice(`l'IV non è di ${String(IV_BYTES)} byte`)
  }
  if (typeof value.ct !== 'string' || value.ct === '') dice('manca il ciphertext')
  return value
}

export function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64')
}

export function fromBase64(base64) {
  return new Uint8Array(Buffer.from(base64.replace(/\s+/g, ''), 'base64'))
}

export function newKdfMeta(iterations = DEFAULT_ITERATIONS) {
  const salt = webcrypto.getRandomValues(new Uint8Array(SALT_BYTES))
  return { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(salt) }
}

export async function deriveKey(passphrase, kdf) {
  const base = await subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ])
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: fromBase64(kdf.salt), iterations: kdf.iterations, hash: kdf.hash },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptEnvelope(data, key, kdf) {
  const iv = webcrypto.getRandomValues(new Uint8Array(IV_BYTES))
  const plain = new TextEncoder().encode(JSON.stringify(data))
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, plain)
  return {
    v: 1,
    kdf,
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    ct: toBase64(new Uint8Array(ct)),
  }
}

export async function decryptEnvelope(envelope, key) {
  const plain = await subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(envelope.cipher.iv) },
    key,
    fromBase64(envelope.ct),
  )
  return JSON.parse(new TextDecoder().decode(plain))
}
