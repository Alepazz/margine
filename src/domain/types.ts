/**
 * Modello dati di Margine.
 *
 * Una spesa normalizzata rappresenta UNA voce di UNO dei tricount.
 * Gli importi sono in euro con due decimali (leggibili a occhio durante la
 * sessione di import mensile); ogni somma passa da `domain/money.ts`, che
 * lavora in centesimi per non accumulare errori in virgola mobile.
 */

/** Le due persone. `partner` non ha spese personali finché non deciderà di importarle. */
export type PersonId = 'me' | 'partner'

export const PERSON_IDS: readonly PersonId[] = ['me', 'partner'] as const

/**
 * Le quattro origini. «vacanze» ne raccoglie diverse: ogni viaggio ha il suo
 * tricount, e il viaggio a cui appartiene sta in `Expense.trip`.
 */
export type Source = 'fisse' | 'personali' | 'condivise' | 'vacanze'

export const SOURCES: readonly Source[] = ['fisse', 'personali', 'condivise', 'vacanze'] as const

export const SOURCE_LABELS: Record<Source, string> = {
  fisse: 'Spese fisse condivise',
  personali: 'Spese personali',
  condivise: 'Altre spese condivise',
  vacanze: 'Vacanze',
}

/**
 * Come si divide una spesa. `me + partner + others` fa sempre esattamente `amount`.
 *
 * `others` esiste perché in vacanza si spende anche con altre persone: una cena
 * da 216 € divisa in sei non è rappresentabile con due sole quote. È un totale
 * **anonimo** per scelta — di chi c'era e di come si dividevano tra loro non
 * teniamo traccia, serve solo sapere quanto di quel conto non era vostro.
 */
export interface Shares {
  me: number
  partner: number
  others?: number
}

/**
 * Chi ha materialmente anticipato il conto. In vacanza può essere stato uno del
 * gruppo: resta anonimo come le sue quote, serve solo a non dire il falso su
 * chi ha tirato fuori la carta.
 */
export type Payer = PersonId | 'others'

export interface Expense {
  /** Stabile nel tempo: è la chiave con cui le annotazioni 730 ritrovano la spesa. */
  id: string
  /** ISO `YYYY-MM-DD`. */
  date: string
  title: string
  /** Importo totale della spesa, in euro. */
  amount: number
  shares: Shares
  /** Chi ha materialmente pagato. */
  paidBy: Payer
  source: Source
  category: string
  subcategory?: string
  /** true per le spese ricorrenti/incomprimibili (affitto, bollette, abbonamenti). */
  recurring: boolean
  /** Id del viaggio, solo per `source === 'vacanze'`. */
  trip?: string

  // ── Campi scritti dall'app (annotazioni) ──
  tax730?: boolean
  notes?: string
  /** Link alle foto degli scontrini su Google Drive. */
  receiptLinks?: string[]
  /**
   * Pagata col welfare aziendale, cioè con soldi che non stanno fra le entrate.
   * La spesa resta contata dove racconta un fatto — quanto è costata una vacanza,
   * l'elenco delle spese, il 730 — ma **non erode il budget del mese** di chi l'ha
   * anticipata: non avendo mai attraversato il suo conto, non può consumarne il
   * margine. Per l'altra persona la sua quota resta una spesa normale, perché
   * quella la rimborsa in contanti. → ADR-0014
   */
  welfare?: boolean
}

export interface Trip {
  id: string
  name: string
  place: string
  country?: string
  year: number
  /** ISO `YYYY-MM-DD`, incluso. */
  start: string
  /** ISO `YYYY-MM-DD`, incluso. */
  end: string
}

export interface Subcategory {
  id: string
  label: string
}

export interface Category {
  id: string
  label: string
  emoji?: string
  subcategories?: Subcategory[]
  /**
   * Slot di colore fisso (0–7) nei grafici. Il colore segue la categoria, non
   * la sua posizione in classifica: un filtro che cambia le categorie a
   * schermo non deve ricolorare quelle che restano. Le categorie senza slot
   * confluiscono nella fetta «Altre» — mai una tinta generata al volo.
   */
  slot?: number
}

export interface Person {
  name: string
  emoji: string
}

export interface MealVouchers {
  valuePerDay: number
  daysPerMonth: number
}

/**
 * Profilo entrate: è quello che trasforma «quanto ho speso» in «quanto margine ho».
 * Si compila con l'intervista a tempo zero e si aggiorna quando cambia lo stipendio.
 */
export interface IncomeProfile {
  /** false finché l'intervista non è stata fatta: l'app lo dice invece di mostrare numeri finti. */
  configured: boolean
  /** Stipendio netto mensile. */
  netMonthly: number
  /** Mensilità aggiuntive all'anno (13ª = 1, 13ª + 14ª = 2). */
  extraMonths: number
  /** Bonus annuo netto, spalmato sui dodici mesi. */
  annualBonusNet: number
  mealVouchers: MealVouchers
  /** Altre entrate nette mensili ricorrenti. */
  otherMonthlyNet: number
  /** Quanto vuoi mettere da parte ogni mese: il margine «vero» è al netto di questo. */
  monthlySavingsTarget: number
  note?: string
}

export interface GithubConfig {
  owner: string
  repo: string
  branch: string
  /** Percorso del dataset cifrato nel repo. */
  dataPath: string
}

export interface AppConfig {
  version: number
  people: Record<PersonId, Person>
  income: { me: IncomeProfile; partner: IncomeProfile | null }
  categories: Category[]
  /** Id della categoria del gatto: alimenta la pagina dedicata. */
  catCategory: string
  /** Id della categoria delle spese di viaggio: dà i nomi alle fette di un viaggio. */
  tripCategory: string
  fiscal: {
    /**
     * Cosa è tipicamente detraibile: l'app lo suggerisce, non decide. Ogni voce
     * è una categoria (`burocrazia`) o una sottocategoria (`gatto/veterinario`),
     * perché dentro la stessa categoria convivono spese detraibili e non — il
     * veterinario sì, la lettiera no.
     */
    deductibleHints: string[]
    /** Promemoria di dove tieni le foto su Drive. */
    driveFolderHint: string
  }
  github: GithubConfig | null
}

export interface Dataset {
  version: number
  /** ISO datetime dell'ultimo aggiornamento. */
  updatedAt: string
  expenses: Expense[]
  trips: Trip[]
}

/** Patch che l'app scrive su una spesa (tag 730, note, scontrini, welfare). */
export interface Annotation {
  expenseId: string
  tax730?: boolean
  notes?: string
  receiptLinks?: string[]
  welfare?: boolean
}
