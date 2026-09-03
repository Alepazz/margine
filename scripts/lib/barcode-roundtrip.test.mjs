/**
 * Il giro completo: disegna, e fa rileggere a qualcun altro.
 *
 * È la prova che tiene in piedi `barcode.ts`, e non è un test come gli altri:
 * qui non si confronta il codice con se stesso, si passa il disegno a un
 * **decodificatore indipendente** — `zxing-wasm`, la stessa famiglia di
 * decodificatori che sta dietro a metà degli scanner del mondo — e si pretende
 * che ritrovi il testo **e** il formato di partenza. Una tabella con un modulo
 * fuori posto non produce un codice «un po' sbagliato»: produce un codice che
 * non si legge, o che si legge diverso. E lo si scopre alla cassa, che è il
 * posto peggiore.
 *
 * I pixel li scriviamo noi, senza nessuna libreria di immagini: dai moduli a un
 * buffer RGBA sono dieci righe, e così il test non dipende da un binario
 * nativo. Il WebAssembly di zxing si carica dal pacchetto e non dalla rete,
 * altrimenti questo test non girerebbe senza internet.
 *
 * Vive **fra gli script** e non fra i test del dominio per la stessa ragione del
 * test di parità delle regole: così a raggiungere il mondo non tipizzato è il
 * file non tipizzato, e `tsc` non deve sapere niente né di `node:fs` né della
 * forma che `zxing` dà a un'immagine.
 */

import { readFile } from 'node:fs/promises'
import { beforeAll, describe, expect, it } from 'vitest'
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'

import { encodeBarcode } from '../../src/domain/barcode.ts'

/** Come `zxing` chiama i formati che sappiamo disegnare. */
const ZXING_NAME = {
  /* Senza trattino: è come li nomina zxing, verificato leggendo il suo verdetto. */
  ean13: 'EAN13',
  ean8: 'EAN8',
  code128: 'Code128',
  code39: 'Code39',
  itf: 'ITF',
}

beforeAll(async () => {
  const wasm = await readFile(
    new URL('../../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm', import.meta.url),
  )
  /* `fireImmediately` perché il modulo si prepari adesso e non alla prima
     lettura: senza, la prima chiamata proverebbe a scaricarlo dalla rete. */
  prepareZXingModule({ overrides: { wasmBinary: wasm }, fireImmediately: true })
})

/**
 * Dai moduli a un'immagine in bianco e nero.
 *
 * `scale` è quanti pixel misura un modulo. Tre è oltre il minimo che un lettore
 * pretende (due) e sotto quello che disegniamo a schermo: se passa qui, passa a
 * schermo.
 */
function raster(code, scale = 3, height = 80) {
  const width = (code.quiet * 2 + code.modules.length) * scale
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  for (let m = 0; m < code.modules.length; m += 1) {
    if (code.modules[m] !== '1') continue
    for (let x = (code.quiet + m) * scale; x < (code.quiet + m + 1) * scale; x += 1) {
      for (let y = 0; y < height; y += 1) {
        const i = (y * width + x) * 4
        data[i] = 0
        data[i + 1] = 0
        data[i + 2] = 0
      }
    }
  }
  return { data, width, height }
}

/**
 * I casi: per ogni formato quello che capita davvero su una carta fedeltà.
 *
 * Il primo EAN-13 è il codice **vero** letto dallo screenshot di Klarna della
 * carta di un supermercato: se il nostro disegno di quel numero si rilegge
 * uguale, stiamo disegnando la stessa cosa che stampa l'app da cui le carte
 * arrivano. Il resto copre i rami che si possono sbagliare: le due codifiche di
 * sinistra dell'EAN-13 (le decide la prima cifra, e con `0` e `8` sono
 * diverse), i due sottoinsiemi del Code 128 (cifre pari e dispari), gli zeri
 * iniziali, e il Code 39 con la sua punteggiatura.
 */
const CASES = [
  ['ean13', '0999888777664'],
  ['ean13', '8001505005707'],
  ['ean13', '4006381333931'],
  ['ean8', '96385074'],
  ['ean8', '55123457'],
  ['code128', '1234567890123'],
  ['code128', '12345678901234'],
  ['code128', 'ABC-1234/xyz'],
  ['code128', '0012345678'],
  ['code39', 'ABC123'],
  ['code39', '12345678'],
  ['code39', 'A-1. $/+%'],
  ['itf', '1234567890'],
  ['itf', '00123456789012'],
]

describe('un decodificatore indipendente rilegge quello che disegniamo', () => {
  it.each(CASES)('%s «%s»', async (format, code) => {
    const drawn = encodeBarcode(code, format)
    expect(drawn, 'il codice deve essere disegnabile').toBeDefined()

    const found = await readBarcodes(raster(drawn), { tryHarder: true })
    expect(found[0]?.text).toBe(code)
    /* Anche il formato, non solo il testo: lo stesso numero disegnato come Code
       128 invece che come EAN-13 alla cassa non passa, ed è un errore che dal
       solo testo non si vedrebbe. */
    expect(found[0]?.format).toBe(ZXING_NAME[format])
  })
})
