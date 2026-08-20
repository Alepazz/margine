/**
 * Identificatori per le cose che l'app crea da sé.
 *
 * Stesso formato di quelli che nascono nell'import — `AAAA-MM-GG-xxxxxxxx` —
 * perché un id è un id: le annotazioni lo usano per ritrovare la spesa, e
 * l'import salta gli id che già conosce, quindi una voce aggiunta dal telefono
 * sopravvive a tutti i reimport successivi senza bisogno di essere marcata.
 */

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  return [...buffer].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function newExpenseId(date: string): string {
  return `${date}-${randomHex(4)}`
}

/** I rimborsi stanno in una lista loro: il prefisso serve solo a leggerli a occhio. */
export function newSettlementId(date: string): string {
  return `rimborso-${date}-${randomHex(3)}`
}

/**
 * Id di un viaggio: leggibile, perché compare nei dati in chiaro durante la
 * sessione mensile e ci si deve capire a occhio di che viaggio si parla.
 */
export function newTripId(name: string, year: number, taken: ReadonlySet<string>): string {
  const slug =
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'viaggio'
  const base = `${slug}-${year}`
  if (!taken.has(base)) return base
  /* Due viaggi nello stesso posto e nello stesso anno: succede. */
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${randomHex(2)}`
}
