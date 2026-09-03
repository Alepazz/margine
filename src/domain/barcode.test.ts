import { describe, expect, it } from 'vitest'

import { barcodeProblem, eanChecksum, encodeBarcode, groupCode, isValidEan } from './barcode'

/**
 * I vettori qui sotto non sono inventati: sono quelli che
 * `barcode.roundtrip.test.ts` ha fatto passare da un decodificatore
 * indipendente, ritrovando testo e formato. Questi test sono la loro custodia —
 * girano senza WebAssembly e cadono se una tabella si muove.
 */

describe('cifra di controllo EAN', () => {
  it('la calcola con i pesi alternati dalla fine', () => {
    /*
     * Un codice **inventato** con la forma di quelli veri — tredici cifre e uno
     * zero iniziale, che è il caso su cui un campo numerico sbaglierebbe. I
     * numeri veri delle carte non entrano nei file tracciati: il repo è
     * pubblico, e il codice di una tessera è quello che la cassa scansiona.
     * → ADR-0067
     */
    expect(eanChecksum('099988877766')).toBe(4)
    expect(eanChecksum('800150500570')).toBe(7)
    expect(eanChecksum('9638507')).toBe(4)
  })

  it('accetta i codici buoni e rifiuta quelli con una cifra sbagliata', () => {
    expect(isValidEan('0999888777664', 13)).toBe(true)
    expect(isValidEan('0999888777665', 13)).toBe(false)
    expect(isValidEan('96385074', 8)).toBe(true)
    /* Lunghezza giusta per l'altro formato: non basta che le cifre tornino. */
    expect(isValidEan('96385074', 13)).toBe(false)
    expect(isValidEan('099988877766x', 13)).toBe(false)
  })
})

describe('larghezze note degli standard', () => {
  /*
   * Le lunghezze sono la prova più economica che una tabella non si è mossa: se
   * un pattern perdesse o guadagnasse un modulo, il totale non tornerebbe. E
   * sono numeri dichiarati dagli standard, non misurati sul nostro codice.
   */
  it('EAN-13 sono 95 moduli, EAN-8 sono 67', () => {
    expect(encodeBarcode('0999888777664', 'ean13')?.modules).toHaveLength(95)
    expect(encodeBarcode('96385074', 'ean8')?.modules).toHaveLength(67)
  })

  it('il Code 128 tutto cifre e di lunghezza pari sta in metà spazio', () => {
    /* Il sottoinsieme C mette due cifre per simbolo: quattordici cifre in 112
       moduli contro le tredici in 178. È la ragione per cui esiste quel ramo —
       su un telefono da 390 px è la differenza fra starci e non starci. */
    expect(encodeBarcode('12345678901234', 'code128')?.modules).toHaveLength(112)
    expect(encodeBarcode('1234567890123', 'code128')?.modules).toHaveLength(178)
  })

  it('il Code 39 aggiunge lo start, lo stop e i separatori', () => {
    /* Sei caratteri più due asterischi, sedici moduli l'uno (quindici più il
       separatore): 8 × 16 = 128. */
    expect(encodeBarcode('ABC123', 'code39')?.modules).toHaveLength(128)
  })

  it('ITF: nove moduli per cifra, più start e stop', () => {
    /* Ogni cifra ha due elementi larghi (tre moduli) e tre stretti: 2×3 + 3×1 =
       9, sempre, qualunque cifra sia. Quindi 4 + 9n + 5 e nient'altro. */
    expect(encodeBarcode('1234567890', 'itf')?.modules).toHaveLength(4 + 9 * 10 + 5)
    expect(encodeBarcode('00123456789012', 'itf')?.modules).toHaveLength(4 + 9 * 14 + 5)
  })
})

describe('quello che non si può disegnare', () => {
  it('non inventa un codice quando il testo non sta nel formato', () => {
    expect(encodeBarcode('0999888777665', 'ean13')).toBeUndefined()
    expect(encodeBarcode('123', 'ean13')).toBeUndefined()
    /* ITF vuole cifre in numero pari: un codice dispari non si aggiusta con uno
       zero davanti, sarebbe un altro codice. */
    expect(encodeBarcode('12345', 'itf')).toBeUndefined()
    expect(encodeBarcode('caffè', 'code128')).toBeUndefined()
    expect(encodeBarcode('ciao!', 'code39')).toBeUndefined()
    expect(encodeBarcode('', 'ean13')).toBeUndefined()
  })

  it('rifiuta l’asterisco in un Code 39, che è il suo delimitatore', () => {
    /*
     * Il difetto peggiore possibile: `*` apre e chiude un Code 39, quindi
     * dentro i dati produce un codice che **si interrompe a metà**. Il disegno
     * compare, sembra buono, e il lettore non legge niente — sbagliato invece
     * che assente. Verificato passando quel raster a un decodificatore: torna
     * a mani vuote. → ADR-0083
     */
    expect(encodeBarcode('AB*CD', 'code39')).toBeUndefined()
    expect(barcodeProblem('AB*CD', 'code39')).toContain('asterisco')
  })

  it('una carta senza codice a barre non ne ha uno, e non è un errore', () => {
    expect(encodeBarcode('333 1234567', 'text')).toBeUndefined()
    expect(barcodeProblem('333 1234567', 'text')).toBeUndefined()
  })

  it('il QR si dichiara mancante invece di far credere a un guasto', () => {
    expect(encodeBarcode('qualcosa', 'qr')).toBeUndefined()
    expect(barcodeProblem('qualcosa', 'qr')).toContain('non si disegna ancora')
  })
})

describe('il problema si dice a parole', () => {
  it('tace quando il codice va bene', () => {
    expect(barcodeProblem('0999888777664', 'ean13')).toBeUndefined()
    expect(barcodeProblem('ABC-1234/xyz', 'code128')).toBeUndefined()
  })

  it('sulla cifra di controllo dice quale sarebbe quella giusta', () => {
    /* Saperla è la differenza fra correggere una cifra e ricominciare da capo:
       quasi sempre è una cifra letta male su una tessera consumata. */
    expect(barcodeProblem('0999888777665', 'ean13')).toContain('dovrebbe essere 4')
  })

  it('sulla lunghezza dice quante cifre servono', () => {
    expect(barcodeProblem('123', 'ean13')).toContain('13 cifre')
    expect(barcodeProblem('123', 'ean8')).toContain('8 cifre')
  })

  it('un codice vuoto è un campo da riempire, non un formato sbagliato', () => {
    expect(barcodeProblem('   ', 'code128')).toBe('Manca il numero della carta.')
  })
})

describe('il numero come si legge alla cassa', () => {
  it('raggruppa l’EAN-13 come è disegnato: 1 + 6 + 6', () => {
    expect(groupCode('0999888777664', 'ean13')).toBe('0 999888 777664')
  })

  it('spezza in quattro quello che non ha una struttura sua', () => {
    expect(groupCode('12345678901', 'code128')).toBe('1234 5678 901')
  })

  it('non tocca un codice che non è di sole cifre', () => {
    /* Uno spazio dentro un Code 128 cambierebbe ciò che il lettore legge. */
    expect(groupCode('ABC-1234/xyz', 'code128')).toBe('ABC-1234/xyz')
  })
})
