/**
 * Cifratura lato client: AES-256-GCM con chiave derivata dalla passphrase via
 * PBKDF2-SHA256. Tutto con WebCrypto, nativo del browser — nessuna libreria.
 *
 * Il repo può stare pubblico: senza la passphrase i file dei dati sono rumore.
 * Se la passphrase è sbagliata GCM fallisce l'autenticazione e lanciamo
 * `WrongPassphraseError`, che l'interfaccia traduce in «passphrase errata».
 */

import {
  DEFAULT_ITERATIONS,
  IV_BYTES,
  SALT_BYTES,
  fromBase64,
  toBase64,
  type Envelope,
  type KdfMeta,
} from './envelope'

export class WrongPassphraseError extends Error {
  constructor() {
    super('Passphrase errata: i dati non si aprono.')
    this.name = 'WrongPassphraseError'
  }
}

export function newKdfMeta(iterations: number = DEFAULT_ITERATIONS): KdfMeta {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  return { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(salt) }
}

async function importPassphrase(passphrase: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ])
}

export async function deriveKey(passphrase: string, kdf: KdfMeta): Promise<CryptoKey> {
  const base = await importPassphrase(passphrase)
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromBase64(kdf.salt), iterations: kdf.iterations, hash: kdf.hash },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

const keyCache = new Map<string, Promise<CryptoKey>>()

async function fingerprint(passphrase: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(passphrase))
  return toBase64(new Uint8Array(digest).subarray(0, 8))
}

/**
 * 600.000 iterazioni non sono gratuite: i due file (dati e config) usano lo
 * stesso salt, quindi la chiave si deriva una volta per sessione.
 */
export async function deriveKeyCached(passphrase: string, kdf: KdfMeta): Promise<CryptoKey> {
  const cacheKey = `${await fingerprint(passphrase)}|${kdf.salt}|${kdf.iterations}|${kdf.hash}`
  const hit = keyCache.get(cacheKey)
  if (hit) return hit
  const pending = deriveKey(passphrase, kdf)
  keyCache.set(cacheKey, pending)
  try {
    await pending
  } catch (err) {
    keyCache.delete(cacheKey)
    throw err
  }
  return pending
}

export async function decryptEnvelope<T>(envelope: Envelope, key: CryptoKey): Promise<T> {
  let plain: ArrayBuffer
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(envelope.cipher.iv) },
      key,
      fromBase64(envelope.ct),
    )
  } catch {
    throw new WrongPassphraseError()
  }
  return JSON.parse(new TextDecoder().decode(plain)) as T
}

export async function encryptEnvelope<T>(data: T, key: CryptoKey, kdf: KdfMeta): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const plain = new TextEncoder().encode(JSON.stringify(data))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain)
  return {
    v: 1,
    kdf,
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    ct: toBase64(new Uint8Array(ct)),
  }
}
