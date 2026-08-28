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
      /* Tutte e trentanove le versioni storiche: PBKDF2/SHA-256, 600.000
         iterazioni, salt da 16 byte, IV da 12. Il controllo non chiude nessuno
         fuori dai propri dati, e questo test è la ragione per cui si può dire. */
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
})
