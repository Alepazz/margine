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
  /**
   * Dove finisce il puntino sul mappamondo. Facoltativa: un viaggio senza
   * coordinate esiste come tutti gli altri, semplicemente compare nell'elenco
   * sotto il globo invece che sopra.
   *
   * `approx: true` quando il posto è una regione o un paese e non un luogo —
   * «Germania» e «Campania e Calabria» non hanno un punto, quindi ne è stato
   * scelto uno centrale. Il mappamondo lo dice, invece di far credere a una
   * precisione che non c'è. → ADR-0020
   */
  coords?: { lat: number; lon: number; approx?: boolean }
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
  /**
   * Il tricount di casa (le spese fisse condivise) e la categoria «casa».
   * Sono **due insiemi diversi** e la pagina Casa li mostra separati: nel
   * tricount finiscono anche telefonia e assicurazione auto, e spese di casa
   * vere finiscono nell'altro tricount condiviso.
   */
  houseSource: Source
  houseCategory: string
  /**
   * Da dove parte il saldo fra le due persone. Calcolarlo da tutta la storia
   * darebbe 9.351 € — falso, perché in due anni si sono già saldati molte volte
   * e nessuno di quei rimborsi è nei dati. Quindi si dichiara un punto di
   * partenza: `opening` è il saldo alla data `since` (positivo = il partner deve
   * a `me`), e da lì in avanti conta quello che è registrato. → ADR-0019
   *
   * Il punto di partenza è **per tricount**, in `groups`: ci si salda un gruppo
   * alla volta — una vacanza può essere pari mentre le spese di casa non lo
   * sono — e un numero solo non è confrontabile con niente di quello che si vede
   * su Tricount. → ADR-0022
   */
  balance: {
    /** Data di ripiego per i tricount che non ne dichiarano una propria. */
    since: string
    /**
     * Residuo **non attribuibile** a nessun tricount: contanti prestati, spese
     * rimaste fuori da ogni gruppo. Entra nel totale una volta sola — non è
     * il valore di partenza dei gruppi, che hanno il proprio.
     */
    opening: number
    note?: string
    /**
     * Punto di partenza per tricount. La chiave è `fisse` | `condivise` |
     * `personali` | `vacanze/<idViaggio>`. Un tricount che non compare qui non
     * ha un numero confrontabile con Tricount, e la pagina lo dichiara invece di
     * mostrare uno zero che sembra un fatto.
     */
    groups?: Record<string, { since: string; opening: number; note?: string }>
  }
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

/**
 * Un rimborso fra le due persone: il movimento che riporta il saldo verso zero.
 *
 * Non è una spesa e non entra da nessuna parte nei conti del mese — le spese
 * contano già solo la propria quota, quindi contare anche il rimborso vorrebbe
 * dire contarlo due volte. Serve a una cosa sola: sapere chi deve cosa a chi.
 * → ADR-0019
 */
export interface Settlement {
  id: string
  date: string
  from: PersonId
  to: PersonId
  amount: number
  note?: string
}

export interface Dataset {
  version: number
  /** ISO datetime dell'ultimo aggiornamento. */
  updatedAt: string
  expenses: Expense[]
  trips: Trip[]
  /**
   * I rimborsi registrati. Il file cifrato scritto prima di ADR-0019 non ha
   * questo campo: viene normalizzato a lista vuota appena i dati entrano
   * nell'app, così da qui in poi il tipo dice la verità.
   */
  settlements: Settlement[]
}

/** Patch che l'app scrive su una spesa (tag 730, note, scontrini, welfare). */
export interface Annotation {
  expenseId: string
  tax730?: boolean
  notes?: string
  receiptLinks?: string[]
  welfare?: boolean
}
