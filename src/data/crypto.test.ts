import { describe, expect, it } from 'vitest'

import { WrongPassphraseError, decryptEnvelope, deriveKey, encryptEnvelope } from './crypto'
import { isEnvelope, type KdfMeta } from './envelope'

/**
 * Iterazioni basse solo nei test: qui si verifica il formato, non la resistenza
 * a un attacco a forza bruta.
 */
const KDF: KdfMeta = { name: 'PBKDF2', hash: 'SHA-256', iterations: 1000, salt: 'MTIzNDU2Nzg5MGFiY2RlZg==' }

const PAYLOAD = { spese: [{ id: 'a', importo: 12.34, titolo: 'Crocchette 🐈' }] }

describe('cifratura', () => {
  it('fa il giro completo e conserva i dati', async () => {
    const key = await deriveKey('passphrase giusta', KDF)
    const envelope = await encryptEnvelope(PAYLOAD, key, KDF)
    expect(isEnvelope(envelope)).toBe(true)
    expect(JSON.stringify(envelope)).not.toContain('Crocchette')
    expect(await decryptEnvelope(envelope, key)).toEqual(PAYLOAD)
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
