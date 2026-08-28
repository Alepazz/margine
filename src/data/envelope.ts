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

/**
 * I limiti entro cui un envelope è accettato, e non sono decorazione.
 *
 * Un file cifrato **si descrive da sé**: porta dentro salt, iterazioni e IV, ed
 * è ciò che lo rende apribile domani se un giorno alziamo il costo (→ ADR-0003).
 * Ma il repo è scrivibile da due persone, e chi ha passphrase e token insieme può
 * scrivere un file con `iterations: 1`: l'app lo aprirebbe, e da lì in avanti
 * **ricifrerebbe con quel valore per sempre**, perché niente lo confrontava con
 * il minimo. Il ciphertext è pubblico, quindi il risultato è un file forzabile in
 * tempo zero, in silenzio. Dall'altro lato `iterations: 1e9` inchioda l'apertura
 * per minuti su un telefono.
 *
 * Il basso è il pavimento sotto cui nessuna versione di Margine ha mai scritto; il
 * DEFAULT resta il valore con cui si scrive oggi. → ADR-0073, ADR-0072
 */
export const MIN_ITERATIONS = 100_000
export const MAX_ITERATIONS = 5_000_000

export const SALT_BYTES = 16
export const IV_BYTES = 12

/**
 * Quanti byte codifica una stringa base64, o **-1** se non è base64 valido —
 * `atob` lancia sui caratteri fuori alfabeto, ed è quel rifiuto che tiene fuori
 * un salt con della spazzatura in coda.
 *
 * Decodifica **per intero**: va chiamata solo su salt e IV (24 e 16 caratteri),
 * mai sul ciphertext, che è mezzo mega.
 */
function base64Bytes(text: string): number {
  try {
    return fromBase64(text).length
  } catch {
    return -1
  }
}

/**
 * true se questo è un envelope che Margine potrebbe aver scritto.
 *
 * **I parametri si controllano, non si accettano.** Prima si guardavano solo i
 * tipi: qualunque numero passava per `iterations`, e `name`, `hash` e
 * `cipher.name` non erano guardati affatto — quindi un file con `hash: 'SHA-1'` e
 * una derivazione da un giro era un envelope valido agli occhi dell'app. Sono i
 * parametri con cui l'app poi **ricifra**, quindi un valore accettato una volta
 * diventa permanente. → ADR-0073
 *
 * Un file fuori da questi limiti non è «un envelope con parametri strani»: è un
 * file che nessuna versione di Margine ha scritto, e il messaggio che l'app
 * mostra — «non è un file cifrato di Margine» — dice il vero.
 */
export function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<Envelope>
  return (
    v.v === 1 &&
    typeof v.ct === 'string' &&
    /* Il lato Node lo pretendeva già: senza, un file con `ct: ''` arrivava
       alla decifratura e l'utente leggeva «passphrase errata» di un file che
       non è un envelope. Le due devono rifiutare le stesse cose. */
    v.ct !== '' &&
    typeof v.kdf === 'object' &&
    v.kdf !== null &&
    v.kdf.name === 'PBKDF2' &&
    v.kdf.hash === 'SHA-256' &&
    typeof v.kdf.salt === 'string' &&
    base64Bytes(v.kdf.salt) === SALT_BYTES &&
    typeof v.kdf.iterations === 'number' &&
    Number.isInteger(v.kdf.iterations) &&
    v.kdf.iterations >= MIN_ITERATIONS &&
    v.kdf.iterations <= MAX_ITERATIONS &&
    typeof v.cipher === 'object' &&
    v.cipher !== null &&
    v.cipher.name === 'AES-GCM' &&
    typeof v.cipher.iv === 'string' &&
    base64Bytes(v.cipher.iv) === IV_BYTES
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
