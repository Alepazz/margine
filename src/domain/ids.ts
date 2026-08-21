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

/** Da un nome a uno slug leggibile: senza accenti, senza spazi, minuscolo. */
function slugify(text: string, fallback: string, max: number): string {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, max) || fallback
  )
}

/** Il primo `base`, `base-2`, `base-3`… che non sia già preso. */
function firstFree(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${randomHex(2)}`
}

/**
 * Id di un tricount di vacanza: leggibile, perché compare nei dati in chiaro
 * durante la sessione mensile e ci si deve capire a occhio di che viaggio si
 * parla. Porta l'anno perché due viaggi nello stesso posto succedono.
 */
export function newTripId(name: string, year: number, taken: ReadonlySet<string>): string {
  return firstFree(`${slugify(name, 'viaggio', 24)}-${year}`, taken)
}

/** Id di un tricount senza viaggio: solo lo slug del nome. */
export function newTricountId(name: string, taken: ReadonlySet<string>): string {
  return firstFree(slugify(name, 'tricount', 24), taken)
}

/**
 * Id di una categoria creata dall'app.
 *
 * Non porta l'anno come i viaggi: una categoria non ha una data, e l'id resta
 * scritto in ogni spesa che la usa — `spesa-2026` invecchierebbe male.
 */
export function newCategoryId(label: string, taken: ReadonlySet<string>): string {
  return firstFree(slugify(label, 'categoria', 20), taken)
}
