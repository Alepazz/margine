/**
 * Le carte fedeltà: le regole, l'ordine, e cosa si può salvare.
 *
 * Come per i prezzi, qui non c'è niente che appartenga a una delle due persone:
 * una carta è di casa. Le funzioni non ricevono mai un `PersonId`, ed è il modo
 * in cui il tipo dice che questa parte dell'app non ha compartimenti.
 * → ADR-0082, ADR-0041
 */

import { barcodeProblem, encodeBarcode } from './barcode'
import { isRealDate } from './expense-rules'
import type { CardFormat, LoyaltyCard } from './types'

export const CARD_FORMATS: readonly CardFormat[] = [
  'ean13',
  'ean8',
  'code128',
  'code39',
  'itf',
  'qr',
  'text',
]

export const FORMAT_LABEL: Record<CardFormat, string> = {
  ean13: 'EAN-13',
  ean8: 'EAN-8',
  code128: 'Code 128',
  code39: 'Code 39',
  itf: 'ITF',
  qr: 'QR',
  text: 'Solo numero',
}

/** Come si spiega un formato a chi non sa cosa sia: dove lo si è visto. */
export const FORMAT_HINT: Record<CardFormat, string> = {
  ean13: 'Tredici cifre, il codice dei prodotti al supermercato',
  ean8: 'Otto cifre, la versione corta',
  code128: 'Barre fitte, accetta anche lettere: il più comune sulle tessere',
  code39: 'Barre larghe, solo lettere maiuscole e cifre',
  itf: 'Solo cifre, in numero pari',
  qr: 'Quadrato a puntini',
  text: 'Nessun codice: alla cassa si dà il numero',
}

/**
 * I formati che il modulo propone.
 *
 * `qr` resta **fuori**, perché non lo sappiamo disegnare e offrirlo vorrebbe
 * dire far scegliere una strada che finisce in una tessera senza codice. Ma il
 * formato di una carta che si sta correggendo si mostra **sempre**, anche se non
 * è fra quelli offerti: è la stessa regola del selettore dei tricount, dove
 * un menù che non contiene il valore corrente lo cambierebbe da sé. → ADR-0027
 */
export function formatOptions(current?: CardFormat): CardFormat[] {
  /* Annotato: senza, TypeScript restringe il tipo dell'elemento a «tutto tranne
     qr» e poi rifiuta il confronto con un `CardFormat` qualsiasi. */
  const offered: CardFormat[] = CARD_FORMATS.filter((format) => format !== 'qr')
  if (current !== undefined && !offered.includes(current)) return [current, ...offered]
  return offered
}

/**
 * Quanto può pesare la faccia di una tessera, come lunghezza del data URI.
 *
 * Le carte vivono in un file cifrato che l'app scarica **a ogni apertura**:
 * ventotto mila caratteri sono circa venti kilobyte di immagine, e con quindici
 * carte fanno mezzo megabyte nel caso peggiore — dove il caso normale, essendo
 * quelle facce dei rettangoli di tinta piatta con un logo, sta sotto i cinque
 * kilobyte l'una. Il tetto serve a rendere impossibile il caso peggiore vero:
 * una foto da quattro megabyte presa dalla galleria e infilata nella coda in
 * `localStorage`, dove il browser concede circa cinque megabyte in tutto.
 * → ADR-0082
 */
export const MAX_IMAGE_CHARS = 28_000

/** I tipi che accettiamo per la faccia: quelli che ogni browser sa disegnare. */
const IMAGE_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/
const COLOR_RE = /^#[0-9a-f]{6}$/i

/**
 * Cosa non va in una carta, a parole. Lista vuota = si può salvare.
 *
 * Le stesse regole vivono in `scripts/lib/validate-core.mjs` per la sessione al
 * Mac, e un test di parità prova che concordano: ciò che l'app accetta, la
 * validazione dei file non lo rifiuta. Vale la lezione della cifratura — un
 * controllo nuovo va aggiunto ai due lati. → ADR-0082, ADR-0018
 */
export function validateCard(card: LoyaltyCard, takenIds: ReadonlySet<string>): string[] {
  const problems: string[] = []

  if (!card.id) problems.push('Manca l’id della carta.')
  else if (takenIds.has(card.id)) problems.push('Questo id di carta esiste già.')

  if (card.name.trim() === '') problems.push('Serve il nome del negozio.')

  /*
   * **Il numero serve sempre**, in ogni formato: è tutto ciò che una carta è.
   * Questo controllo sta **prima** e **fuori** dalla clemenza verso il QR, e la
   * ragione è un difetto vero: perdonando a una carta a QR ogni verdetto di
   * `barcodeProblem` si perdonava anche «manca il numero», perché quella
   * funzione lo dice per prima. L'app salvava una carta senza codice, la
   * pubblicazione la rifiutava, e `npm run encrypt` si fermava senza scrivere
   * **nessuno** dei tre file — spese e configurazione comprese, e dal telefono
   * nessun modo di capirlo. → ADR-0082
   */
  if (card.code.trim() === '') problems.push('Manca il numero della carta.')

  if (!CARD_FORMATS.includes(card.format)) {
    problems.push(`Formato sconosciuto (${card.format}).`)
  } else if (card.code.trim() !== '') {
    /*
     * Il codice si controlla **contro il suo formato**, non da solo: è l'unica
     * cosa che impedisce di salvare una carta che alla cassa non passerà, e il
     * motivo per cui la validazione qui chiama lo stesso disegnatore che la
     * pagina userà. Un EAN-13 con la cifra di controllo sbagliata è il caso che
     * capita davvero, leggendo male una tessera consumata.
     */
    const problem = barcodeProblem(card.code, card.format)
    /* Il QR è l'unico formato di cui `barcodeProblem` parla senza vietare — «non
       lo so disegnare» non è un motivo per non salvare la carta, perché il
       numero serve comunque. */
    if (problem !== undefined && card.format !== 'qr') problems.push(problem)
  }

  /* La stessa `isRealDate` delle spese: `2026-02-30` supera una regex e non
     esiste, e una data che l'app accetta e la pubblicazione rifiuta bloccherebbe
     `npm run encrypt` per **tutti** i file. */
  if (!isRealDate(card.addedAt)) problems.push(`Data non valida (${card.addedAt}).`)

  if (card.image !== undefined) {
    if (!IMAGE_RE.test(card.image)) {
      problems.push('L’immagine della tessera deve essere un PNG, JPEG o WebP incorporato.')
    } else if (card.image.length > MAX_IMAGE_CHARS) {
      problems.push('L’immagine della tessera è troppo grande: va ridotta prima di salvarla.')
    }
  }

  if (card.color !== undefined && !COLOR_RE.test(card.color)) {
    problems.push(`Colore non valido (${card.color}): serve la forma #rrggbb.`)
  }

  if (card.note !== undefined && typeof card.note !== 'string') {
    problems.push('La nota deve essere testo.')
  }

  return problems
}

/** Vero se di questa carta si può disegnare il codice a barre. */
export function hasBarcode(card: LoyaltyCard): boolean {
  return encodeBarcode(card.code, card.format) !== undefined
}

// ─────────────────────────── l'ordine dell'elenco ───────────────────────────

export type CardOrder = 'nome' | 'recenti'

export const ORDER_LABEL: Record<CardOrder, string> = {
  nome: 'Nome',
  recenti: 'Usate di recente',
}

/**
 * L'elenco ordinato.
 *
 * `lastUsed` è **un segno del dispositivo**, non un dato: quando hai aperto una
 * tessera l'ultima volta lo sa il telefono che avevi in mano, e la carta che usi
 * ogni settimana deve salire **sul tuo** elenco senza muovere quello dell'altra
 * persona. Metterlo nei dati vorrebbe dire un commit per ogni volta che si apre
 * una tessera alla cassa, cioè un commit per ogni spesa fatta.
 *
 * A pari merito e per le carte mai usate si torna al nome: un ordine che
 * cambia da sé fra due aperture non è un ordine.
 */
export function sortCards(
  cards: readonly LoyaltyCard[],
  order: CardOrder,
  lastUsed: Readonly<Record<string, number>> = {},
): LoyaltyCard[] {
  const byName = (a: LoyaltyCard, b: LoyaltyCard): number =>
    a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })
  if (order === 'nome') return [...cards].sort(byName)
  return [...cards].sort((a, b) => {
    const usoA = lastUsed[a.id] ?? 0
    const usoB = lastUsed[b.id] ?? 0
    return usoB - usoA || byName(a, b)
  })
}

// ─────────────────────────── il colore della fascia ───────────────────────────

/**
 * Se sopra quel colore il testo va scritto chiaro o scuro.
 *
 * Serve perché il colore non lo scegliamo noi: lo ricava la migrazione dalla
 * faccia della tessera, e fra le carte di un portafoglio ci sono un rosso
 * scurissimo e un bianco. Scrivere sempre bianco renderebbe illeggibile la
 * seconda. La soglia è sulla **luminanza relativa** di WCAG, che è la stessa
 * grandezza con cui si misura il contrasto, e non sulla media dei tre canali:
 * il verde pesa sei volte il blu per come funziona l'occhio.
 *
 * **La soglia è 0,4 e non 0,179**, che è il punto in cui il bianco e il nero
 * danno lo stesso contrasto. Sta più in alto di proposito: fra i due valori il
 * bianco perde qualcosa in contrasto e vince in aspetto, ed è ciò che fanno le
 * app di tessere — misurato sulle otto carte vere, le tre tinte che cadono in
 * quella fascia (due rossi da supermercato e un verde) tengono il bianco fra
 * 4,10:1 e 4,34:1, sopra il 3:1 che WCAG chiede al testo grande, che è la
 * dimensione del nome nella fascia. Da sapere: una tinta **media** — luminanza
 * intorno a 0,39, per esempio un verde acceso — prenderebbe il bianco a 2,38:1,
 * sotto ogni soglia. Se un giorno una carta lo facesse vedere, la forma robusta
 * non è spostare la soglia ma confrontare i due rapporti di contrasto.
 *
 * **Vuole un colore, non `undefined`**, ed è il tipo a dirlo perché la versione
 * che accettava l'assenza aveva un ripiego per forza sbagliato: torni «chiaro»
 * e su una tessera senza tinta — che ha il fondo neutro del tema, chiaro —
 * scrivi bianco su bianco. Visto al banco, esattamente così. Senza colore non
 * si sceglie fra chiaro e scuro: si usa l'inchiostro del tema sulla superficie
 * del tema, che si leggono per costruzione. → ADR-0082
 */
export function inkOn(color: string): 'chiaro' | 'scuro' {
  if (!COLOR_RE.test(color)) return 'chiaro'
  const channel = (from: number): number => {
    const value = Number.parseInt(color.slice(from, from + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  return luminance > 0.4 ? 'scuro' : 'chiaro'
}
