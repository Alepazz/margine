/**
 * Modello dati di Margine.
 *
 * Una spesa normalizzata rappresenta UNA voce di UNO dei tricount.
 * Gli importi sono in euro con due decimali (leggibili a occhio durante la
 * sessione di import mensile); ogni somma passa da `domain/money.ts`, che
 * lavora in centesimi per non accumulare errori in virgola mobile.
 */

/** Le due persone. Sono le uniche che un tricount può avere come membri, oggi. */
export type PersonId = 'me' | 'partner'

export const PERSON_IDS: readonly PersonId[] = ['me', 'partner'] as const

/**
 * La parte di viaggio di un tricount di vacanza: date, luogo, e il puntino sul
 * mappamondo. Sta **dentro** il tricount perché su Tricount ogni vacanza è un
 * gruppo come gli altri: non esiste «l'origine vacanze» con dentro i viaggi,
 * esistono tricount che sono viaggi. → ADR-0037
 */
export interface TripInfo {
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

/**
 * Un tricount: il registro in cui una spesa vive, **con i suoi membri**.
 *
 * «Personale» non è più un caso speciale del modello: è un tricount con un
 * membro solo, e da questo discende tutto — le sue spese sono al 100% di quel
 * membro, non compare nei menù dell'altra persona, e non ha mai un saldo.
 * → ADR-0037
 *
 * Nome ed emoji sono **dati**, non codice: vivono nel file cifrato, perché il
 * repo è pubblico e i nomi che due persone danno ai propri tricount sono roba
 * loro. → ADR-0026
 */
export interface Tricount {
  id: string
  name: string
  emoji?: string
  /** Chi vi partecipa. Mai vuoto; oggi le persone possibili sono due. */
  members: PersonId[]
  /**
   * Vero quando il tricount è chiuso: smette di comparire fra quelli in cui si
   * può inserire una spesa.
   *
   * **Non** significa «saldato»: quello è il punto di partenza in
   * `config.balance.groups`. Una vacanza può essere finita e avere ancora un
   * debito aperto — deve restare nel saldo e sparire dal menù, e con un campo
   * solo una delle due cose sarebbe sbagliata. → ADR-0027
   */
  closed?: boolean
  /** Presente = questo tricount è una vacanza. */
  trip?: TripInfo
  /**
   * Vero quando il tricount è un **progetto**: una cosa che si compra una volta
   * — una casa — e che non è la vita di tutti i mesi.
   *
   * Le sue spese restano spese a tutti gli effetti: stanno negli elenchi, nel
   * 730, nel saldo del progetto. Ma **non passano da `visibleFor()`**, quindi
   * non entrano in margine, medie, proiezioni e confronti: trentaseimila euro
   * di rogito in un mese renderebbero quel mese incomparabile con ogni altro, e
   * la media di un anno la porterebbero via da sola. → ADR-0074
   *
   * E non entrano nemmeno nel saldo di ogni giorno: il debito di un progetto si
   * salda per conto suo, con i suoi tempi, e sommarlo a quello della spesa
   * quotidiana renderebbe illeggibili tutti e due.
   */
  offBudget?: boolean
  /**
   * La categoria in cui il progetto **continua a costare** dentro i conti di
   * ogni giorno: per una casa comprata, la rata del mutuo.
   *
   * Quelle spese vivono altrove — nel tricount delle fisse, con la spunta
   * ricorrente, divise a metà — perché sono la vita di tutti i mesi e devono
   * erodere il margine come l'affitto che sostituiscono. La pagina del progetto
   * le mostra come un **secondo insieme, mai sommato al primo**: è la stessa
   * regola della pagina Casa, dove il tricount e la categoria non coincidono e
   * fonderli conterebbe due volte l'intersezione. → ADR-0074, ADR-0017
   *
   * Ha senso solo su un tricount `offBudget`, e la validazione lo pretende.
   */
  recurringCategory?: string
}

/** Vero se il tricount è un progetto: la sua spesa sta fuori dai conti del mese. */
export function isProject(tricount: Tricount): boolean {
  return tricount.offBudget === true
}

/** I tricount che sono progetti, nell'ordine dei dati. */
export function projectsOf(tricounts: readonly Tricount[]): Tricount[] {
  return tricounts.filter(isProject)
}

/** Vero se la persona partecipa al tricount: è il filtro dei menù di inserimento. */
export function isMember(tricount: Tricount, person: PersonId): boolean {
  return tricount.members.includes(person)
}

/**
 * L'unico membro di un tricount, se ne ha uno solo.
 *
 * È la definizione di «tricount personale», e sta in una funzione perché da lei
 * discendono tre comportamenti in punti distanti — il modulo non offre la
 * divisione, lo spostamento rifà le quote, l'import le assume tutte di quel
 * membro. Scritta a mano in tre posti, il giorno che i membri possibili
 * diventano tre uno dei tre resterebbe indietro.
 */
export function soleMemberOf(tricount: Tricount | undefined): PersonId | undefined {
  return tricount?.members.length === 1 ? tricount.members[0] : undefined
}

/**
 * Emoji e nome di qualcosa che ha un'identità: un tricount, una persona.
 * Senza emoji è il nome, senza spazi appesi.
 */
export function titleOf(thing: { name: string; emoji?: string }): string {
  return thing.emoji ? `${thing.emoji} ${thing.name}` : thing.name
}

/** Emoji e nome di un tricount, per i menù e i titoli: «🏡 Spese casa». */
export function tricountTitleOf(tricount: { name: string; emoji?: string }): string {
  return titleOf(tricount)
}

/**
 * Un viaggio come lo vogliono la pagina Vacanze, il mappamondo e le
 * statistiche: il tricount e la sua parte di viaggio **appiattiti** in un
 * oggetto solo. È una vista di lettura — il dato vero è il `Tricount` — e
 * esiste perché `trip.start` si legge meglio di `tricount.trip.start` in
 * trenta punti che non hanno bisogno di sapere dei membri.
 */
export interface Trip extends TripInfo {
  id: string
  name: string
  emoji?: string
  closed?: boolean
}

/** I tricount che sono viaggi, appiattiti. L'ordine è quello dell'elenco. */
export function tripsOf(tricounts: readonly Tricount[]): Trip[] {
  return tricounts.flatMap((tricount) =>
    tricount.trip
      ? [
          {
            id: tricount.id,
            name: tricount.name,
            ...(tricount.emoji !== undefined ? { emoji: tricount.emoji } : {}),
            ...(tricount.closed !== undefined ? { closed: tricount.closed } : {}),
            ...tricount.trip,
          },
        ]
      : [],
  )
}

/** Emoji e nome di un viaggio. */
export function tripTitleOf(trip: { name: string; emoji?: string }): string {
  return titleOf(trip)
}

/**
 * Come si divide una spesa. `me + partner + others` fa sempre esattamente `amount`.
 *
 * `others` esiste perché in vacanza si spende anche con altre persone: una cena
 * da 180 € divisa in sei non è rappresentabile con due sole quote. È un totale
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
  /**
   * L'id del tricount in cui la spesa vive. È **la** chiave: la stessa con cui
   * il saldo raggruppa (`balance.groups`) e con cui i menù scelgono. Prima
   * erano due campi — un'«origine» più il viaggio — e ogni spostamento doveva
   * tenerli d'accordo a mano. → ADR-0037
   */
  tricount: string
  category: string
  subcategory?: string
  /** true per le spese ricorrenti/incomprimibili (affitto, bollette, abbonamenti). */
  recurring: boolean

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
  /**
   * Percorso della configurazione cifrata. Serve da quando le categorie e le
   * entrate si modificano dall'app. Senza, quelle due cose restano in sola
   * lettura e l'app lo dice: **non si indovina un percorso** su cui poi si
   * committa. → ADR-0024
   */
  configPath?: string
}

export interface AppConfig {
  version: number
  people: Record<PersonId, Person>
  income: { me: IncomeProfile; partner: IncomeProfile | null }
  /**
   * Le categorie sono **dato scrivibile dall'app**: si creano, si rinominano e
   * si cancellano da Impostazioni, e l'app riscrive `config.json.enc`. Prima
   * erano una copia di `scripts/lib/taxonomy.mjs`, che da ora è solo il valore
   * iniziale. → ADR-0024
   */
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
  houseTricount: string
  houseCategory: string
  /**
   * Da dove parte il saldo fra le due persone. Calcolarlo da tutta la storia
   * darebbe migliaia di euro — falso, perché in due anni si sono già saldati
   * molte volte e nessuno di quei rimborsi è nei dati. Quindi si dichiara un
   * punto di partenza: `opening` è il saldo alla data `since` (positivo = il
   * partner deve a `me`), e da lì in avanti conta quello che è registrato.
   * → ADR-0019
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
     * Punto di partenza per tricount. La chiave è **l'id del tricount**. Un
     * tricount che non compare qui non ha un numero confrontabile con Tricount,
     * e la pagina lo dichiara invece di mostrare uno zero che sembra un fatto.
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
  /**
   * Il **progetto** a cui il rimborso appartiene, quando ce n'è uno.
   *
   * Assente vuol dire «il rapporto di ogni giorno», ed è il caso normale:
   * ADR-0019 dice che un rimborso non appartiene a nessun tricount, e per la
   * spesa quotidiana resta vero — si salda il rapporto per intero, non un
   * gruppo alla volta. Un progetto però ha un debito suo, con i suoi tempi
   * (diciottomila euro che rientrano in tre anni), e mescolarlo al saldo del
   * pane e delle bollette renderebbe illeggibili tutti e due. Quindi il verso
   * di questo campo è: **valorizzato solo per un tricount `offBudget`**, e la
   * validazione lo pretende. → ADR-0075, ADR-0019
   */
  tricount?: string
}

/** In che cosa è misurato un prezzo. L'etichetta a scaffale usa queste tre. */
export type PriceUnit = 'kg' | 'l' | 'pezzo'

/**
 * Una rilevazione di prezzo a scaffale: «passata di pomodoro, 2,15 €/kg,
 * Esselunga, 21/08/2026».
 *
 * **Non è una spesa** e non ne diventa mai una: non ha quote, non ha un tricount,
 * non tocca margine, saldo né statistiche. È un fatto osservato — quanto costava
 * quella cosa, là, quel giorno — e serve a una domanda sola: davanti allo
 * scaffale, quanto costa altrove. Per questo è **condivisa** fra le due persone
 * invece di appartenere a chi l'ha scritta: il prezzo del latte non è di nessuno.
 * → ADR-0041
 */
export interface PriceEntry {
  id: string
  /** Nome del prodotto, testo libero già ripulito dagli spazi ai bordi. */
  product: string
  /** Il supermercato, testo libero come il prodotto. */
  store: string
  unit: PriceUnit
  /** Euro per unità di misura: quello che l'etichetta riporta per legge. */
  price: number
  /** ISO `YYYY-MM-DD`: quando è stato visto quel prezzo. */
  date: string
  note?: string
}

export interface Dataset {
  version: number
  /** ISO datetime dell'ultimo aggiornamento. */
  updatedAt: string
  expenses: Expense[]
  /** I tricount, viaggi compresi: sono loro a dire chi partecipa a cosa. */
  tricounts: Tricount[]
  /**
   * I rimborsi registrati. Il file cifrato scritto prima di ADR-0019 non ha
   * questo campo: viene normalizzato a lista vuota appena i dati entrano
   * nell'app, così da qui in poi il tipo dice la verità.
   */
  settlements: Settlement[]
  /**
   * Le rilevazioni di prezzo. Come `settlements`, il campo può mancare nei file
   * cifrati scritti prima e si normalizza a lista vuota all'ingresso: è
   * **additivo**, quindi non ha richiesto una migrazione. → ADR-0041
   */
  prices: PriceEntry[]
}

/** Patch che l'app scrive su una spesa (tag 730, note, scontrini, welfare). */
export interface Annotation {
  expenseId: string
  tax730?: boolean
  notes?: string
  receiptLinks?: string[]
  welfare?: boolean
}
