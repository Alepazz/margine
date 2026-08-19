/**
 * Formato del file cifrato che vive nel repo.
 *
 * È autodescrittivo: dentro c'è tutto quello che serve per decifrarlo (salt,
 * iterazioni, IV), tranne la passphrase. Così un file scritto oggi resta
 * apribile anche se domani alziamo il numero di iterazioni.
 */

export interface KdfMeta {
  name: 'PBKDF2'
  hash: 'SHA-256'
  iterations: number
  /** base64 */
  salt: string
}

export interface Envelope {
  v: 1
  kdf: KdfMeta
  cipher: { name: 'AES-GCM'; iv: string }
  /** Ciphertext in base64 (include il tag di autenticazione GCM). */
  ct: string
}

/** OWASP 2026 per PBKDF2-HMAC-SHA256. Circa mezzo secondo su un telefono recente. */
export const DEFAULT_ITERATIONS = 600_000

export const SALT_BYTES = 16
export const IV_BYTES = 12

export function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<Envelope>
  return (
    v.v === 1 &&
    typeof v.ct === 'string' &&
    typeof v.kdf === 'object' &&
    v.kdf !== null &&
    typeof v.kdf.salt === 'string' &&
    typeof v.kdf.iterations === 'number' &&
    typeof v.cipher === 'object' &&
    v.cipher !== null &&
    typeof v.cipher.iv === 'string'
  )
}

const CHUNK = 0x8000

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function fromBase64(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64.replace(/\s+/g, ''))
  const out = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}
