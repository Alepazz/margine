/**
 * La lista della spesa: cosa resta da prendere, e cosa è già nello storico.
 *
 * **Funziona come Bring** (→ ADR-0089), e da lì discende tutto: la lista è
 * *solo* ciò che resta da prendere, e sotto c'è **lo storico** — ciò che è già
 * stato preso, un secondo fa o mesi fa. Non è «lo storico», ed è Alessio ad
 * averlo corretto: «non è nello storico, ma è proprio il passato». Una cosa presa
 * non scade e non si cancella da sé, e rimetterci le mani la riporta in lista
 * con la sua quantità, il suo negozio e la sua nota — quindi **lo storico è
 * anche il catalogo dei prodotti di casa**: la «memoria dei prodotti» non è un
 * meccanismo a parte, è questo guardato da un altro lato.
 *
 * Come per i prezzi e le carte, qui non c'è niente che appartenga a una delle
 * due persone: la lista è di casa. Le funzioni non ricevono mai un `PersonId`,
 * ed è il modo in cui il tipo dice che questa parte dell'app non ha
 * compartimenti. → ADR-0088, ADR-0041, ADR-0082
 */

import { isIsoDateTime } from './dates'
import type { ProductGroup } from './prices'
import { nameKey } from './text'
import type { PriceUnit, ShoppingItem, ShoppingUnit } from './types'

export const SHOPPING_UNITS: readonly ShoppingUnit[] = ['pezzo', 'kg', 'g', 'l', 'ml'] as const

/**
 * Come si chiama un'unità nel selettore.
 *
 * `L` maiuscola come nella pagina dei prezzi (`€/L`), `ml` minuscolo perché è
 * così che sta scritto su ogni confezione italiana: la coerenza che conta è con
 * l'etichetta a scaffale, non con il Sistema Internazionale.
 */
export const SHOPPING_UNIT_LABEL: Record<ShoppingUnit, string> = {
  pezzo: 'pezzi',
  kg: 'kg',
  g: 'g',
  l: 'L',
  ml: 'ml',
}

/**
 * Come si chiama un'unità nella tendina del modulo.
 *
 * Due tabelle come per i prezzi (`UNIT_LABEL` e `UNIT_CHOICE`), e per la stessa
 * ragione: accanto a un numero si scrive «500 g», in una tendina si legge
 * «grammi». Sono due registri della stessa cosa, e stanno **una accanto
 * all'altra** perché il giorno che si aggiunge un'unità non se ne dimentichi una.
 */
export const SHOPPING_UNIT_CHOICE: Record<ShoppingUnit, string> = {
  pezzo: 'pezzi',
  kg: 'kg',
  g: 'grammi',
  l: 'litri',
  ml: 'ml',
}

/** Quanto può essere lungo un titolo, e una nota: il file deve restare piccolo. */
const MAX_TITLE_CHARS = 100
const MAX_NOTE_CHARS = 300
const MAX_STORE_CHARS = 60
/** Il massimo di una quantità: oltre, è un refuso o un dito scivolato. */
const MAX_QTY = 9999

const decimali = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 3 })

/**
 * La quantità come si legge **accanto al titolo**: `×3`, `3 kg`, `500 g`, `1,5 L`.
 *
 * Accanto, non all'altro bordo della riga: era incolonnata a destra come gli
 * importi, e Alessio l'ha bocciata — «quantità è lontana dal titolo», quindi due
 * cose invece di una. «Latte 2 L» si legge in un colpo d'occhio.
 *
 * I pezzi portano il segno di moltiplicazione e non l'unità, perché «3 pezzi di
 * mele» non è italiano e «3 mele» non si può comporre — il titolo può essere al
 * singolare, al plurale o un marchio. `×3` funziona con tutti.
 *
 * Senza quantità torna `undefined`, che è diverso da una stringa vuota: chi
 * disegna deve poter **non mettere niente** accanto al titolo, e non uno spazio
 * vuoto appeso. La quantità è un'informazione **in più**, e la maggior parte
 * delle voci non ne ha: «a noi basta scrivere un generico Carne».
 *
 * Una quantità senza unità si legge come pezzi. Non è uno stato che il modulo
 * produce (scegliere un numero obbliga a scegliere un'unità, che parte da
 * «pezzo»), ma un dato scritto a mano sì, e per una cosa che si sa leggere non
 * si rifiuta niente.
 */
export function qtyLabel(item: Pick<ShoppingItem, 'qty' | 'unit'>): string | undefined {
  if (item.qty === undefined || !Number.isFinite(item.qty) || item.qty <= 0) return undefined
  const numero = decimali.format(item.qty)
  if (item.unit === undefined || item.unit === 'pezzo') return `×${numero}`
  return `${numero} ${SHOPPING_UNIT_LABEL[item.unit]}`
}

/**
 * Le cose da prendere, dalla più recente.
 *
 * L'ordine è su `wantedAt` — quando la cosa è **entrata (o rientrata) in
 * lista** — e non sull'ordine dell'elenco, che non saprebbe dirlo: riaggiungere
 * dallo storico non muove la voce di posto nell'array, quindi con l'ordine di
 * inserimento una cosa richiesta un minuto fa comparirebbe in fondo, fra quelle
 * di due settimane prima.
 */
export function toBuy(items: readonly ShoppingItem[]): ShoppingItem[] {
  return items
    .filter((item) => item.takenAt === undefined)
    .sort((a, b) => (a.wantedAt < b.wantedAt ? 1 : a.wantedAt > b.wantedAt ? -1 : 0))
}

/** Lo storico, dall'ultima cosa presa: è anche il catalogo. → ADR-0089 */
export function taken(items: readonly ShoppingItem[]): ShoppingItem[] {
  return items
    .filter((item) => item.takenAt !== undefined)
    .sort((a, b) => (a.takenAt! < b.takenAt! ? 1 : a.takenAt! > b.takenAt! ? -1 : 0))
}

export interface KnownPrice {
  store: string
  price: number
  unit: PriceUnit
}

/**
 * Il prezzo migliore che sappiamo di quella cosa, dall'osservatorio dei prezzi.
 *
 * Il collegamento è il **nome normalizzato**, la stessa chiave con cui i prezzi
 * raggruppano (`nameKey`): «Passata di pomodoro» nella lista trova la passata di
 * pomodoro delle rilevazioni. Nient'altro — in particolare **nessun confronto
 * fra le unità**: la lista misura in grammi e millilitri, i prezzi in chili e
 * litri, e incrociarli sarebbe una tabella di conversione per un guadagno nullo,
 * perché la riga dichiara la sua unità e chi legge sa cosa vuol dire.
 *
 * Fra due gruppi con lo stesso nome (lo stesso prodotto rilevato al chilo e al
 * pezzo) vince quello **aggiornato più di recente**: è il prezzo che si è visto
 * per ultimo, cioè quello che ci si aspetta di ritrovare a scaffale.
 *
 * Prende il tabellone già costruito e non le rilevazioni: `priceBoard` non è
 * gratis, e la pagina lo calcola una volta per tutte le righe.
 */
export function bestKnownPrice(
  board: readonly ProductGroup[],
  title: string,
): KnownPrice | undefined {
  const chiave = nameKey(title)
  if (chiave === '') return undefined
  let migliore: ProductGroup | undefined
  for (const gruppo of board) {
    if (nameKey(gruppo.product) !== chiave) continue
    if (migliore === undefined || gruppo.updated > migliore.updated) migliore = gruppo
  }
  /* `rows` è ordinato dal più conveniente da `priceBoard`: la prima è la
     migliore, e non la si ricalcola qui. */
  const riga = migliore?.rows[0]
  if (!riga || !migliore) return undefined
  return { store: riga.store, price: riga.latest.price, unit: migliore.unit }
}

/**
 * I campi da scrivere su una voce che **rientra dallo storico**.
 *
 * Nasce da un difetto trovato al banco: scrivendo «caffè» nel modulo per
 * riportare in lista il «Caffè» dello storico, il confronto campo-per-campo
 * rinominava la voce con la grafia sciatta appena digitata e — peggio —
 * **cancellava** il negozio e la nota che la voce ricordava, perché nel modulo
 * erano vuoti.
 *
 * Ma lo storico *è* la memoria dei prodotti di casa (→ ADR-0089): un campo
 * vuoto là vuol dire «tieni quello di prima», non «togli». Quindi:
 *
 * - il **titolo non si tocca mai**: la grafia buona è quella già salvata;
 * - gli altri campi si scrivono **solo se c'è qualcosa da scrivere**.
 *
 * Per cambiare davvero il nome, o per togliere un negozio, c'è la matita — che
 * è un gesto diverso e passa da un confronto diverso.
 */
export function revivedFields(
  existing: ShoppingItem,
  typed: ShoppingItem,
): Partial<ShoppingItem> {
  const fields: Partial<ShoppingItem> = {}
  if (typed.qty !== undefined && (typed.qty !== existing.qty || typed.unit !== existing.unit)) {
    fields.qty = typed.qty
    if (typed.unit !== undefined) fields.unit = typed.unit
  }
  if (typed.store !== undefined && typed.store !== existing.store) fields.store = typed.store
  if (typed.note !== undefined && typed.note !== existing.note) fields.note = typed.note
  return fields
}

/**
 * Cosa non va in una voce della lista, a parole. Lista vuota = si può salvare.
 *
 * Le stesse regole vivono in `scripts/lib/validate-core.mjs` per la sessione al
 * Mac, e un test di parità prova che concordano: ciò che l'app accetta, la
 * pubblicazione non lo rifiuta. Vale la lezione della cifratura e delle carte —
 * un controllo nuovo va aggiunto ai due lati **e** alla tabella del test, o le
 * due smettono di dire la stessa cosa in silenzio. → ADR-0088, ADR-0082
 */
export function validateShoppingItem(
  item: ShoppingItem,
  takenIds: ReadonlySet<string>,
): string[] {
  const problems: string[] = []

  if (!item.id) problems.push('Manca l’id della voce.')
  else if (takenIds.has(item.id)) problems.push('Questo id di voce esiste già.')

  /* **L'unico campo obbligatorio**, ed è la richiesta di Alessio parola per
     parola: tutto il resto è facoltativo. */
  if (typeof item.title !== 'string' || item.title.trim() === '') {
    problems.push('Serve il nome della cosa da comprare.')
  } else if (item.title.length > MAX_TITLE_CHARS) {
    problems.push(`Il nome è troppo lungo: al massimo ${String(MAX_TITLE_CHARS)} caratteri.`)
  }

  if (item.qty !== undefined) {
    if (!Number.isFinite(item.qty) || item.qty <= 0) {
      problems.push('La quantità deve essere maggiore di zero.')
    } else if (item.qty > MAX_QTY) {
      problems.push(`La quantità non può superare ${String(MAX_QTY)}.`)
    } else if (Math.round(item.qty * 1000) !== item.qty * 1000) {
      problems.push('La quantità ha troppi decimali: al massimo tre.')
    }
  }

  if (item.unit !== undefined) {
    if (!SHOPPING_UNITS.includes(item.unit)) {
      problems.push(`Unità sconosciuta (${item.unit}).`)
    } else if (item.qty === undefined) {
      /* «kg di mele» non vuol dire niente, e non è un caso da perdonare come la
         quantità senza unità: là si sa cosa fare, qui no. */
      problems.push('C’è l’unità di misura ma non la quantità.')
    }
  }

  if (item.store !== undefined && item.store.length > MAX_STORE_CHARS) {
    problems.push(`Il nome del negozio è troppo lungo: al massimo ${String(MAX_STORE_CHARS)}.`)
  }
  if (item.note !== undefined) {
    if (typeof item.note !== 'string') problems.push('La nota deve essere testo.')
    else if (item.note.length > MAX_NOTE_CHARS) {
      problems.push(`La nota è troppo lunga: al massimo ${String(MAX_NOTE_CHARS)} caratteri.`)
    }
  }

  /* Le due date sono **datetime**, non giorni: `takenAt` ordina lo storico e
     `wantedAt` la lista, quindi il giorno non basta — dieci cose prese nello
     stesso pomeriggio finirebbero in un ordine qualsiasi. */
  if (!isIsoDateTime(item.wantedAt)) problems.push(`Data non valida (${item.wantedAt}).`)
  if (item.takenAt !== undefined && !isIsoDateTime(item.takenAt)) {
    problems.push(`Data di quando è stata presa non valida (${item.takenAt}).`)
  }

  return problems
}
