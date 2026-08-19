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
export const SALT_BYTES = 16
export const IV_BYTES = 12

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
