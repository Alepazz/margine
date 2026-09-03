/**
 * Da un numero di carta ai moduli bianchi e neri da disegnare.
 *
 * **Perché a mano e non con una libreria.** La scelta è la stessa di ADR-0020
 * per il mappamondo — trenta righe di proiezione invece di `d3-geo` — e qui vale
 * di più: queste sono funzioni **pure**, quindi vivono nel dominio e hanno dei
 * test veri nell'ambiente `node` del progetto, mentre una libreria che disegna
 * dentro un elemento del DOM non si può provare dove i test girano. In più il
 * disegno resta nostro: zona di quiete, larghezza del modulo e `viewBox` li
 * decide chi conosce lo schermo, non le opzioni di qualcun altro.
 *
 * **Le tabelle non sono ricopiate a mano.** Sono state generate una volta da
 * `jsbarcode` (MIT), che le porta come dati puri, e poi **verificate
 * misurando**: `scripts/lib/barcode-roundtrip.test.mjs` disegna ogni formato, lo
 * rasterizza e lo rilegge con `zxing-wasm`, che è un decodificatore
 * indipendente, e pretende di ritrovare il testo e il formato di partenza. È la stessa idea di
 * `globe-land.ts` — nel pacchetto entra il dato, non la libreria — con la
 * differenza che questi standard non cambieranno mai, quindi non c'è niente da
 * rigenerare e la dipendenza è uscita dal progetto. I vettori che il giro ha
 * confermato stanno in `barcode.test.ts`.
 *
 * Ogni funzione torna una **stringa di moduli**: `'1'` barra, `'0'` spazio,
 * tutti della stessa larghezza. Chi disegna non sa niente di codici a barre.
 */

import type { CardFormat } from './types'

/**
 * Un codice pronto da disegnare.
 *
 * `quiet` è la **zona di quiete**: i moduli bianchi ai due lati senza i quali il
 * lettore non trova l'inizio del codice. È un numero di moduli e non dei pixel
 * perché scala con loro; dieci è il minimo prudente per tutti i formati qui
 * dentro (l'EAN-13 ne pretende nove a sinistra e sette a destra).
 */
export interface Barcode {
  modules: string
  quiet: number
}

const QUIET = 10

// ─────────────────────────── EAN-13 e EAN-8 ───────────────────────────

const EAN_SIDE = '101'
const EAN_MIDDLE = '01010'

/** Le tre cifre in codice: sinistra dispari, sinistra pari, destra. */
const EAN_L = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
]
const EAN_G = [
  '0100111',
  '0110011',
  '0011011',
  '0100001',
  '0011101',
  '0111001',
  '0000101',
  '0010001',
  '0001001',
  '0010111',
]
const EAN_R = [
  '1110010',
  '1100110',
  '1101100',
  '1000010',
  '1011100',
  '1001110',
  '1010000',
  '1000100',
  '1001000',
  '1110100',
]

/**
 * Quale delle due codifiche di sinistra usare, cifra per cifra: è così che la
 * **prima** cifra di un EAN-13 entra nel disegno senza avere barre proprie.
 */
const EAN13_PARITY = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLL',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
]

/**
 * La cifra di controllo di un EAN: pesi 1 e 3 alternati **dalla fine**.
 *
 * Dalla fine e non dall'inizio: è ciò che rende la stessa formula valida per
 * l'EAN-13 e per l'EAN-8, che hanno una lunghezza diversa. Riceve il codice
 * **senza** la cifra di controllo.
 */
export function eanChecksum(digits: string): number {
  let sum = 0
  for (let i = 0; i < digits.length; i += 1) {
    const digit = Number(digits[digits.length - 1 - i])
    sum += i % 2 === 0 ? digit * 3 : digit
  }
  return (10 - (sum % 10)) % 10
}

/** Vero se il codice ha la lunghezza giusta e la cifra di controllo torna. */
export function isValidEan(code: string, length: 13 | 8): boolean {
  if (!new RegExp(`^\\d{${String(length)}}$`).test(code)) return false
  return eanChecksum(code.slice(0, -1)) === Number(code.slice(-1))
}

function encodeEan13(code: string): Barcode | undefined {
  if (!isValidEan(code, 13)) return undefined
  const parity = EAN13_PARITY[Number(code[0])]
  if (parity === undefined) return undefined
  let left = ''
  for (let i = 0; i < 6; i += 1) {
    const table = parity[i] === 'L' ? EAN_L : EAN_G
    left += table[Number(code[i + 1])] ?? ''
  }
  let right = ''
  for (let i = 7; i < 13; i += 1) right += EAN_R[Number(code[i])] ?? ''
  return {
    modules: EAN_SIDE + left + EAN_MIDDLE + right + EAN_SIDE,
    quiet: QUIET,
  }
}

function encodeEan8(code: string): Barcode | undefined {
  if (!isValidEan(code, 8)) return undefined
  let left = ''
  for (let i = 0; i < 4; i += 1) left += EAN_L[Number(code[i])] ?? ''
  let right = ''
  for (let i = 4; i < 8; i += 1) right += EAN_R[Number(code[i])] ?? ''
  return {
    modules: EAN_SIDE + left + EAN_MIDDLE + right + EAN_SIDE,
    quiet: QUIET,
  }
}

// ─────────────────────────── Code 128 ───────────────────────────

/**
 * I 107 simboli del Code 128, undici moduli l'uno — tranne lo stop, che ne ha
 * tredici. L'indice **è** il valore del simbolo, ed è quello che entra nella
 * somma di controllo.
 */
const CODE128 = [
  '11011001100',
  '11001101100',
  '11001100110',
  '10010011000',
  '10010001100',
  '10001001100',
  '10011001000',
  '10011000100',
  '10001100100',
  '11001001000',
  '11001000100',
  '11000100100',
  '10110011100',
  '10011011100',
  '10011001110',
  '10111001100',
  '10011101100',
  '10011100110',
  '11001110010',
  '11001011100',
  '11001001110',
  '11011100100',
  '11001110100',
  '11101101110',
  '11101001100',
  '11100101100',
  '11100100110',
  '11101100100',
  '11100110100',
  '11100110010',
  '11011011000',
  '11011000110',
  '11000110110',
  '10100011000',
  '10001011000',
  '10001000110',
  '10110001000',
  '10001101000',
  '10001100010',
  '11010001000',
  '11000101000',
  '11000100010',
  '10110111000',
  '10110001110',
  '10001101110',
  '10111011000',
  '10111000110',
  '10001110110',
  '11101110110',
  '11010001110',
  '11000101110',
  '11011101000',
  '11011100010',
  '11011101110',
  '11101011000',
  '11101000110',
  '11100010110',
  '11101101000',
  '11101100010',
  '11100011010',
  '11101111010',
  '11001000010',
  '11110001010',
  '10100110000',
  '10100001100',
  '10010110000',
  '10010000110',
  '10000101100',
  '10000100110',
  '10110010000',
  '10110000100',
  '10011010000',
  '10011000010',
  '10000110100',
  '10000110010',
  '11000010010',
  '11001010000',
  '11110111010',
  '11000010100',
  '10001111010',
  '10100111100',
  '10010111100',
  '10010011110',
  '10111100100',
  '10011110100',
  '10011110010',
  '11110100100',
  '11110010100',
  '11110010010',
  '11011011110',
  '11011110110',
  '11110110110',
  '10101111000',
  '10100011110',
  '10001011110',
  '10111101000',
  '10111100010',
  '11110101000',
  '11110100010',
  '10111011110',
  '10111101110',
  '11101011110',
  '11110101110',
  '11010000100',
  '11010010000',
  '11010011100',
  '1100011101011',
]

const CODE128_START_B = 104
const CODE128_START_C = 105
const CODE128_STOP = 106

/** Il Code 128 sa scrivere solo l'ASCII stampabile: da spazio a tilde. */
const CODE128_RE = /^[\x20-\x7e]+$/

/**
 * **Due sottoinsiemi puri, e nessun passaggio dall'uno all'altro.**
 *
 * Il Code 128 permette di cambiare codifica a metà codice, e quello è il posto
 * dove vivono gli errori. Qui non serve: tutte le cifre e lunghezza pari vanno
 * in **C**, che ne mette due per simbolo e dimezza la larghezza (un codice di
 * tredici cifre in B misura 178 moduli, in C 112 — e su un telefono da 390 px
 * la differenza è fra starci e non starci); tutto il resto va in **B**, un
 * simbolo per carattere. Un codice di cifre in numero dispari resta in B: è più
 * larga e giusta, invece che strettissima e mescolata.
 *
 * Le due strade danno **lo stesso testo** al lettore: il sottoinsieme è come si
 * scrive, non cosa si legge.
 */
function code128Values(code: string): number[] | undefined {
  if (!CODE128_RE.test(code)) return undefined
  if (/^\d+$/.test(code) && code.length % 2 === 0) {
    const values = [CODE128_START_C]
    for (let i = 0; i < code.length; i += 2) values.push(Number(code.slice(i, i + 2)))
    return values
  }
  const values = [CODE128_START_B]
  for (const char of code) values.push(char.charCodeAt(0) - 32)
  return values
}

function encodeCode128(code: string): Barcode | undefined {
  const values = code128Values(code)
  if (!values) return undefined
  /* La somma di controllo: lo start pesa uno, e da lì i pesi salgono. */
  let sum = values[0] ?? 0
  for (let i = 1; i < values.length; i += 1) sum += i * (values[i] ?? 0)
  const all = [...values, sum % 103, CODE128_STOP]
  return {
    modules: all.map((value) => CODE128[value] ?? '').join(''),
    quiet: QUIET,
  }
}

// ─────────────────────────── Code 39 ───────────────────────────

/**
 * Quindici moduli per carattere, più uno di spazio fra un carattere e l'altro.
 *
 * **Senza `*`**, e non è una dimenticanza: nel Code 39 l'asterisco è il
 * delimitatore, non un carattere. Tenerlo qui dentro produceva il difetto
 * peggiore possibile — `AB*CD` disegnava un codice che si **interrompe a metà**,
 * quindi le barre comparivano, sembravano buone, e un decodificatore ci trovava
 * il nulla. Sbagliato invece che assente, e lo si sarebbe scoperto alla cassa.
 * Il delimitatore sta in `CODE39_GUARD`, dove nessun dato lo può raggiungere.
 * → ADR-0083
 */
const CODE39: Record<string, string> = {
  '0': '101000111011101',
  '1': '111010001010111',
  '2': '101110001010111',
  '3': '111011100010101',
  '4': '101000111010111',
  '5': '111010001110101',
  '6': '101110001110101',
  '7': '101000101110111',
  '8': '111010001011101',
  '9': '101110001011101',
  A: '111010100010111',
  B: '101110100010111',
  C: '111011101000101',
  D: '101011100010111',
  E: '111010111000101',
  F: '101110111000101',
  G: '101010001110111',
  H: '111010100011101',
  I: '101110100011101',
  J: '101011100011101',
  K: '111010101000111',
  L: '101110101000111',
  M: '111011101010001',
  N: '101011101000111',
  O: '111010111010001',
  P: '101110111010001',
  Q: '101010111000111',
  R: '111010101110001',
  S: '101110101110001',
  T: '101011101110001',
  U: '111000101010111',
  V: '100011101010111',
  W: '111000111010101',
  X: '100010111010111',
  Y: '111000101110101',
  Z: '100011101110101',
  '-': '100010101110111',
  '.': '111000101011101',
  ' ': '100011101011101',
  $: '100010001000101',
  '/': '100010001010001',
  '+': '100010100010001',
  '%': '101000100010001',
}

/** Lo `*` che apre e chiude, tenuto fuori dai caratteri di dato. */
const CODE39_GUARD = '100010111011101'

function encodeCode39(code: string): Barcode | undefined {
  const upper = code.toUpperCase()
  /* Lo spazio di separazione fa parte della sequenza, non della tabella:
     scritto una volta qui invece che quarantaquattro volte là. */
  let modules = `${CODE39_GUARD}0`
  for (const char of upper) {
    const pattern = CODE39[char]
    if (pattern === undefined) return undefined
    modules += `${pattern}0`
  }
  return { modules: `${modules}${CODE39_GUARD}0`, quiet: QUIET }
}

// ─────────────────────────── ITF (2 di 5 interlacciato) ───────────────────────────

const ITF_START = '1010'
const ITF_END = '11101'
/** Cinque elementi per cifra: `1` largo (tre moduli), `0` stretto (uno). */
const ITF = [
  '00110',
  '10001',
  '01001',
  '11000',
  '00101',
  '10100',
  '01100',
  '00011',
  '10010',
  '01010',
]

/**
 * Le cifre stanno **a coppie**, una nelle barre e una negli spazi: è da qui che
 * viene il nome, e la ragione per cui la lunghezza deve essere pari. Un codice
 * dispari non si aggiusta con uno zero davanti — sarebbe un altro codice.
 */
function encodeItf(code: string): Barcode | undefined {
  if (!/^(\d\d)+$/.test(code)) return undefined
  let middle = ''
  for (let i = 0; i < code.length; i += 2) {
    const bars = ITF[Number(code[i])]
    const spaces = ITF[Number(code[i + 1])]
    if (bars === undefined || spaces === undefined) return undefined
    for (let k = 0; k < 5; k += 1) {
      middle += bars[k] === '1' ? '111' : '1'
      middle += spaces[k] === '1' ? '000' : '0'
    }
  }
  return { modules: ITF_START + middle + ITF_END, quiet: QUIET }
}

// ─────────────────────────── la porta ───────────────────────────

/**
 * Il codice disegnabile, o `undefined` se quel testo non sta in quel formato.
 *
 * `undefined` non è un errore da nascondere: la pagina mostra il numero grande
 * e dice perché la barra non c'è. Il motivo a parole lo dà `barcodeProblem`.
 */
export function encodeBarcode(code: string, format: CardFormat): Barcode | undefined {
  const clean = code.trim()
  if (clean === '') return undefined
  switch (format) {
    case 'ean13':
      return encodeEan13(clean)
    case 'ean8':
      return encodeEan8(clean)
    case 'code128':
      return encodeCode128(clean)
    case 'code39':
      return encodeCode39(clean)
    case 'itf':
      return encodeItf(clean)
    case 'qr':
    case 'text':
      return undefined
  }
}

/**
 * Perché quel testo non si può disegnare in quel formato, a parole.
 *
 * Serve al modulo di inserimento, dove è l'unica cosa che impedisce di salvare
 * una carta che alla cassa non passerà: il codice si vede disegnato mentre si
 * digita, e quando non si vede questa frase dice cosa manca. `undefined` = va
 * bene.
 */
export function barcodeProblem(code: string, format: CardFormat): string | undefined {
  const clean = code.trim()
  if (clean === '') return 'Manca il numero della carta.'
  if (format === 'text') return undefined
  if (format === 'qr') {
    return 'Il QR non si disegna ancora: la carta si salva, la tessera mostrerà il numero.'
  }
  if (encodeBarcode(clean, format) !== undefined) return undefined
  switch (format) {
    case 'ean13':
    case 'ean8': {
      const length = format === 'ean13' ? 13 : 8
      if (!new RegExp(`^\\d{${String(length)}}$`).test(clean)) {
        return `Un ${format === 'ean13' ? 'EAN-13' : 'EAN-8'} ha esattamente ${String(length)} cifre.`
      }
      /* La cifra giusta si dice: quasi sempre è una cifra letta male, e saperla
         è la differenza fra correggere e ricominciare. */
      const wanted = eanChecksum(clean.slice(0, -1))
      return `Cifra di controllo sbagliata: l'ultima dovrebbe essere ${String(wanted)}.`
    }
    case 'code128':
      return 'Il Code 128 accetta lettere, cifre e punteggiatura, non accenti né emoji.'
    case 'code39':
      if (clean.includes('*')) {
        return 'L’asterisco apre e chiude un Code 39: dentro il numero non ci può stare.'
      }
      return 'Il Code 39 accetta cifre, lettere A-Z e i segni - . spazio $ / + %.'
    case 'itf':
      return 'L’ITF vuole solo cifre, in numero pari.'
  }
}

/**
 * Il numero come si legge a voce alla cassa: a gruppi, non tutto attaccato.
 *
 * Tredici cifre di fila non si dettano e non si controllano a occhio. I gruppi
 * seguono la struttura del formato dove ne ha una — l'EAN-13 è 1 + 6 + 6, ed è
 * anche il modo in cui il codice è disegnato — e altrimenti sono da quattro.
 * Sul testo non numerico non si tocca niente: uno spazio dentro un Code 128
 * cambierebbe ciò che si legge.
 */
export function groupCode(code: string, format: CardFormat): string {
  const clean = code.trim()
  if (!/^\d+$/.test(clean)) return clean
  if (format === 'ean13' && clean.length === 13) {
    return `${clean.slice(0, 1)} ${clean.slice(1, 7)} ${clean.slice(7)}`
  }
  if (format === 'ean8' && clean.length === 8) {
    return `${clean.slice(0, 4)} ${clean.slice(4)}`
  }
  return clean.replace(/(\d{4})(?=\d)/g, '$1 ')
}
