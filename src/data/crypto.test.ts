import { describe, expect, it } from 'vitest'

import { WrongPassphraseError, decryptEnvelope, deriveKey, encryptEnvelope } from './crypto'
import { MIN_ITERATIONS, isEnvelope, type KdfMeta } from './envelope'

/**
 * Il **pavimento**, non il valore di produzione: qui si verifica il formato, non
 * la resistenza a un attacco a forza bruta, e mille iterazioni sarebbero più
 * veloci — ma `isEnvelope` da ADR-0073 le rifiuta, ed è giusto che questo test
 * usi un valore che l'app accetterebbe davvero. Chi alzasse il pavimento senza
 * pensarci troverebbe questo test rosso.
 */
const KDF: KdfMeta = {
  name: 'PBKDF2',
  hash: 'SHA-256',
  iterations: MIN_ITERATIONS,
  salt: 'MTIzNDU2Nzg5MGFiY2RlZg==',
}

const PAYLOAD = { spese: [{ id: 'a', importo: 12.34, titolo: 'Crocchette 🐈' }] }

describe('cifratura', () => {
  it('fa il giro completo e conserva i dati', async () => {
    const key = await deriveKey('passphrase giusta', KDF)
    const envelope = await encryptEnvelope(PAYLOAD, key, KDF)
    expect(isEnvelope(envelope)).toBe(true)
    expect(JSON.stringify(envelope)).not.toContain('Crocchette')
    expect(await decryptEnvelope(envelope, key)).toEqual(PAYLOAD)
  })

  /*
   * ─────────────────────────────────────────────────────────────────────────
   * I parametri si controllano, non si accettano.
   *
   * Un envelope porta dentro le proprie iterazioni, e sono quelle con cui l'app
   * poi **ricifra**: un valore accettato una volta diventa permanente. Chi ha
   * passphrase e token insieme potrebbe scrivere un file da un giro di
   * derivazione e rendere forzabile in tempo zero un ciphertext pubblico.
   * → ADR-0073
   * ─────────────────────────────────────────────────────────────────────────
   */
  describe('i parametri fuori limite non sono envelope', () => {
    const buono = { v: 1 as const, kdf: KDF, cipher: { name: 'AES-GCM' as const, iv: 'MTIzNDU2Nzg5MGFi' }, ct: 'AAAA' }

    it('parte da un envelope che va bene', () => {
      expect(isEnvelope(buono)).toBe(true)
    })

    it('rifiuta una derivazione troppo debole', () => {
      expect(isEnvelope({ ...buono, kdf: { ...KDF, iterations: 1 } })).toBe(false)
      expect(isEnvelope({ ...buono, kdf: { ...KDF, iterations: MIN_ITERATIONS - 1 } })).toBe(false)
    })

    it('rifiuta una derivazione così costosa da bloccare il telefono', () => {
      expect(isEnvelope({ ...buono, kdf: { ...KDF, iterations: 1_000_000_000 } })).toBe(false)
    })

    it('rifiuta iterazioni che non sono un intero', () => {
      expect(isEnvelope({ ...buono, kdf: { ...KDF, iterations: Number.NaN } })).toBe(false)
      expect(isEnvelope({ ...buono, kdf: { ...KDF, iterations: 600_000.5 } })).toBe(false)
    })

    it('rifiuta un digest diverso da SHA-256', () => {
      expect(isEnvelope({ ...buono, kdf: { ...KDF, hash: 'SHA-1' } })).toBe(false)
    })

    it('rifiuta una derivazione o una cifratura che non sono le nostre', () => {
      expect(isEnvelope({ ...buono, kdf: { ...KDF, name: 'scrypt' } })).toBe(false)
      expect(isEnvelope({ ...buono, cipher: { name: 'AES-CBC', iv: 'MTIzNDU2Nzg5MGFi' } })).toBe(false)
    })

    it('rifiuta un salt o un IV della lunghezza sbagliata', () => {
      expect(isEnvelope({ ...buono, kdf: { ...KDF, salt: 'MTIz' } })).toBe(false)
      expect(isEnvelope({ ...buono, cipher: { name: 'AES-GCM' as const, iv: 'MTIz' } })).toBe(false)
    })

    it('e accetta ogni envelope che il progetto ha pubblicato finora', () => {
      /* Ogni versione pubblicata finora sta qui: PBKDF2/SHA-256, 600.000
         iterazioni, salt da 16 byte, IV da 12 — contate una per una il
         28/08/2026, trentanove allora, e il numero cresce a ogni salvataggio
         dall'app. Il controllo non chiude nessuno fuori dai propri dati, e
         questo test è la ragione per cui si può dire. */
      expect(isEnvelope({ ...buono, kdf: { ...KDF, iterations: 600_000 } })).toBe(true)
    })
  })

  it('rifiuta la passphrase sbagliata invece di restituire spazzatura', async () => {
    const good = await deriveKey('passphrase giusta', KDF)
    const bad = await deriveKey('passphrase sbagliata', KDF)
    const envelope = await encryptEnvelope(PAYLOAD, good, KDF)
    await expect(decryptEnvelope(envelope, bad)).rejects.toThrow(WrongPassphraseError)
  })

  it('usa un IV diverso a ogni cifratura', async () => {
    const key = await deriveKey('passphrase giusta', KDF)
    const first = await encryptEnvelope(PAYLOAD, key, KDF)
    const second = await encryptEnvelope(PAYLOAD, key, KDF)
    expect(first.cipher.iv).not.toBe(second.cipher.iv)
    expect(first.ct).not.toBe(second.ct)
  })
})

describe('compatibilità con gli script Node', () => {
  it('decifra nel browser quello che ha cifrato lo script, e viceversa', async () => {
    /* Specificatore non letterale: gli script sono JavaScript fuori da src/,
       e non devono entrare nella compilazione TypeScript dell'app. */
    const path = '../../scripts/lib/crypto-node.mjs'
    const nodeCrypto = await import(path)

    const nodeKey = await nodeCrypto.deriveKey('stessa passphrase', KDF)
    const fromNode = await nodeCrypto.encryptEnvelope(PAYLOAD, nodeKey, KDF)
    const browserKey = await deriveKey('stessa passphrase', KDF)
    expect(await decryptEnvelope(fromNode, browserKey)).toEqual(PAYLOAD)

    const fromBrowser = await encryptEnvelope(PAYLOAD, browserKey, KDF)
    expect(await nodeCrypto.decryptEnvelope(fromBrowser, nodeKey)).toEqual(PAYLOAD)
  })

  /**
   * ADR-0073 dichiara che le due implementazioni «devono rifiutare le stesse
   * cose: una divergenza nella severità è una divergenza». Era una promessa
   * senza presidio, e infatti la review del 28/08/2026 ne ha trovate **tre**:
   * `ct: ''` lo accettava il browser e lo rifiutava Node, un salt e un IV con
   * spazzatura fuori dall'alfabeto base64 li accettava Node e li rifiutava il
   * browser (`Buffer.from` scarta i caratteri illegali, `atob` lancia).
   *
   * Questo test è il presidio: una tabella di mutazioni, e per ciascuna il
   * verdetto dei due lati deve **coincidere**. Non pretende che una mutazione
   * sia rifiutata — pretende che le due siano d'accordo, che è l'invariante
   * vero e quello che nessuno dei due controlli sa dire da solo.
   */
  it('rifiuta esattamente le stesse cose del browser', async () => {
    const path = '../../scripts/lib/crypto-node.mjs'
    const nodeCrypto = await import(path)

    const buono = { v: 1 as const, kdf: KDF, cipher: { name: 'AES-GCM' as const, iv: 'MTIzNDU2Nzg5MGFi' }, ct: 'AAAA' }
    const mutazioni: readonly [string, unknown][] = [
      ['come è', buono],
      ['senza ciphertext', { ...buono, ct: '' }],
      ['ciphertext non stringa', { ...buono, ct: 42 }],
      ['versione sbagliata', { ...buono, v: 2 }],
      ['non è un oggetto', 'MTIz'],
      ['nullo', null],
      ['manca kdf', { ...buono, kdf: undefined }],
      ['derivazione altra', { ...buono, kdf: { ...KDF, name: 'scrypt' } }],
      ['digest debole', { ...buono, kdf: { ...KDF, hash: 'SHA-1' } }],
      ['un giro solo', { ...buono, kdf: { ...KDF, iterations: 1 } }],
      ['pavimento esatto', { ...buono, kdf: { ...KDF, iterations: MIN_ITERATIONS } }],
      ['un giro sotto il pavimento', { ...buono, kdf: { ...KDF, iterations: MIN_ITERATIONS - 1 } }],
      ['iterazioni con la virgola', { ...buono, kdf: { ...KDF, iterations: 600_000.5 } }],
      ['iterazioni non numero', { ...buono, kdf: { ...KDF, iterations: '600000' } }],
      ['salt corto', { ...buono, kdf: { ...KDF, salt: 'MTIz' } }],
      ['salt con spazzatura in coda', { ...buono, kdf: { ...KDF, salt: `${KDF.salt}!!!` } }],
      /* `atob` accetta il base64 senza riempimento: 22 caratteri danno gli
         stessi 16 byte di 24. Il primo tentativo di allineare Node lo
         rifiutava, cioè apriva una divergenza nuova chiudendone tre. */
      ['salt senza riempimento', { ...buono, kdf: { ...KDF, salt: KDF.salt.replace(/=+$/, '') } }],
      ['IV senza riempimento', { ...buono, cipher: { name: 'AES-GCM', iv: 'MTIzNDU2Nzg5MGFi'.replace(/=+$/, '') } }],
      ['cifratura altra', { ...buono, cipher: { name: 'AES-CBC', iv: 'MTIzNDU2Nzg5MGFi' } }],
      ['IV corto', { ...buono, cipher: { name: 'AES-GCM', iv: 'MTIz' } }],
      ['IV con spazzatura in coda', { ...buono, cipher: { name: 'AES-GCM', iv: 'MTIzNDU2Nzg5MGFi@@@' } }],
    ]

    const disaccordi: string[] = []
    for (const [nome, valore] of mutazioni) {
      const browser = isEnvelope(valore)
      let node = true
      try {
        nodeCrypto.assertEnvelope(valore, 'il file di prova')
      } catch {
        node = false
      }
      if (browser !== node) disaccordi.push(`${nome}: browser ${String(browser)}, node ${String(node)}`)
    }

    expect(disaccordi).toEqual([])
    /* E la tabella deve contenere sia dei sì sia dei no, o passerebbe anche se
       uno dei due controlli sparisse del tutto. */
    expect(mutazioni.filter(([, v]) => isEnvelope(v))).toHaveLength(4)
  })
})
