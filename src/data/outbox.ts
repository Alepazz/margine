/**
 * Coda locale delle modifiche che l'app scrive nel repo.
 *
 * Non più solo annotazioni: da quando esiste il pulsante «+» la coda è un
 * **registro di operazioni** — crea, modifica, elimina, annota, aggiungi un
 * viaggio. Si applicano in ordine di tempo, così due tocchi sulla stessa spesa
 * finiscono nell'ordine in cui li hai fatti.
 *
 * Due code, non una:
 * - `pending`  → non ancora committate (offline, token scaduto, errore).
 * - `settled`  → già committate, ma GitHub Pages può metterci un minuto a
 *                ripubblicare: finché il file servito è quello vecchio, queste
 *                vanno riapplicate al caricamento, altrimenti una spesa appena
 *                aggiunta sembrerebbe sparita e riapparsa.
 *
 * Le voci `settled` si eliminano da sole quando il dato scaricato le contiene già.
 */

import { randomHex } from '../domain/ids'
import { toCents } from '../domain/money'
import type {
  Annotation,
  AppConfig,
  CardsFile,
  Category,
  Dataset,
  Expense,
  IncomeProfile,
  LoyaltyCard,
  PersonId,
  PriceEntry,
  Settlement,
  Tricount,
} from '../domain/types'

/*
 * v3 con il modello a tricount (ADR-0037): le operazioni della v2 portavano
 * `source` + `trip` e qui non si possono convertire, perché «personali» era un
 * tricount solo e il suo compartimento di destinazione dipende da chi l'aveva
 * scritto — che la coda non sa. La v2 si ignora: è il costo, dichiarato nella
 * migrazione, di una coda rimasta non sincronizzata durante il cambio.
 */
const STORAGE_KEY = 'margine.outbox.v3'
/** Le code dei modelli passati: si cancellano, non si convertono. */
const DEAD_KEYS = ['margine.outbox.v1', 'margine.outbox.v2']
const SETTLED_TTL_MS = 14 * 24 * 60 * 60 * 1000

export type Op =
  | ({ kind: 'patch' } & Annotation)
  | { kind: 'create'; expense: Expense }
  | { kind: 'update'; expenseId: string; fields: Partial<Expense> }
  | { kind: 'delete'; expenseId: string }
  | { kind: 'tricount'; tricount: Tricount }
  | { kind: 'tricount-edit'; tricountId: string; fields: Partial<Tricount> }
  | { kind: 'settle'; settlement: Settlement }
  | { kind: 'unsettle'; settlementId: string }
  /**
   * Una rilevazione di prezzo, e la sua cancellazione. Sono le due sole
   * operazioni possibili: non c'è un `price-edit` perché correggere una
   * rilevazione è cancellarla e rifarla — è un fatto osservato in un giorno, non
   * uno stato che evolve. → ADR-0041
   */
  | { kind: 'price'; entry: PriceEntry }
  | { kind: 'price-delete'; priceId: string }
  /**
   * L'elenco **intero** delle categorie, nuovo. Non un delta: la tassonomia è
   * una lista ordinata in cui gli slot di colore devono restare coerenti fra
   * loro, e due delta applicati in ordine diverso darebbero due liste diverse.
   * Sostituirla per intero rende l'operazione idempotente per costruzione. → ADR-0024
   */
  | { kind: 'categories'; categories: Category[] }
  /** Le spese di una categoria passano a un'altra: è la controparte di una cancellazione. */
  | { kind: 'recategorize'; from: string; to: string }
  | { kind: 'income'; person: PersonId; profile: IncomeProfile }
  /**
   * Una carta fedeltà: si aggiunge, si corregge e si elimina.
   *
   * Il `card-edit` c'è, a differenza dei prezzi, perché una carta è uno **stato**
   * e non un fatto osservato in un giorno: il nome si corregge, la faccia si
   * sostituisce, la nota cambia. Un prezzo di ieri invece è quanto costava ieri,
   * e correggerlo sarebbe riscrivere il passato. → ADR-0082, ADR-0041
   */
  | { kind: 'card'; card: LoyaltyCard }
  | { kind: 'card-edit'; cardId: string; fields: Partial<LoyaltyCard> }
  | { kind: 'card-delete'; cardId: string }

/**
 * Quale dei tre file cifrati riscrive un'operazione.
 *
 * Erano due e la domanda era un booleano (`touchesConfig`). Con le carte sono
 * tre, e il tipo è un'unione **esaustiva**: un'operazione nuova senza un file di
 * destinazione non compila, invece di finire per sbaglio nel file delle spese —
 * dove il salvataggio l'applicherebbe a un dataset che non la riguarda, non
 * troverebbe niente da fare, e la lascerebbe in coda per sempre. → ADR-0082
 */
export type FileTarget = 'data' | 'config' | 'cards'

export function fileOf(entry: Op): FileTarget {
  switch (entry.kind) {
    case 'categories':
    case 'income':
      return 'config'
    case 'card':
    case 'card-edit':
    case 'card-delete':
      return 'cards'
    case 'patch':
    case 'create':
    case 'update':
    case 'delete':
    case 'tricount':
    case 'tricount-edit':
    case 'settle':
    case 'unsettle':
    case 'price':
    case 'price-delete':
    case 'recategorize':
      return 'data'
  }
}

export type OutboxEntry = Op & { entryId: string; ts: number }

export interface OutboxState {
  pending: OutboxEntry[]
  settled: OutboxEntry[]
}

export const EMPTY_OUTBOX: OutboxState = { pending: [], settled: [] }

function isEntry(value: unknown): value is OutboxEntry {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<OutboxEntry>
  if (typeof v.entryId !== 'string' || typeof v.ts !== 'number') return false
  switch (v.kind) {
    case 'patch':
    case 'update':
    case 'delete':
      return typeof (v as { expenseId?: unknown }).expenseId === 'string'
    case 'create':
      return typeof (v as { expense?: { id?: unknown } }).expense?.id === 'string'
    case 'tricount':
      return typeof (v as { tricount?: { id?: unknown } }).tricount?.id === 'string'
    case 'tricount-edit':
      return typeof (v as { tricountId?: unknown }).tricountId === 'string'
    case 'settle':
      return typeof (v as { settlement?: { id?: unknown } }).settlement?.id === 'string'
    case 'unsettle':
      return typeof (v as { settlementId?: unknown }).settlementId === 'string'
    case 'price':
      return typeof (v as { entry?: { id?: unknown } }).entry?.id === 'string'
    case 'price-delete':
      return typeof (v as { priceId?: unknown }).priceId === 'string'
    case 'categories': {
      /* Non vuoto: una tassonomia senza categorie non è uno stato che l'app sa
         produrre, quindi una voce così è spazzatura — e applicarla lascerebbe
         ogni spesa senza etichetta. */
      const list = (v as { categories?: unknown }).categories
      return Array.isArray(list) && list.length > 0
    }
    case 'recategorize': {
      const op = v as { from?: unknown; to?: unknown }
      return typeof op.from === 'string' && typeof op.to === 'string'
    }
    case 'income':
      return typeof (v as { profile?: { netMonthly?: unknown } }).profile?.netMonthly === 'number'
    case 'card':
      return typeof (v as { card?: { id?: unknown } }).card?.id === 'string'
    case 'card-edit':
    case 'card-delete':
      return typeof (v as { cardId?: unknown }).cardId === 'string'
    default:
      return false
  }
}

export function loadOutbox(): OutboxState {
  try {
    /* Non lasciare in giro la coda di un modello che non esiste più: il
       prossimo che apre gli strumenti del browser la troverebbe e non saprebbe
       dire se conta ancora. */
    for (const dead of DEAD_KEYS) localStorage.removeItem(dead)
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_OUTBOX
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_OUTBOX
    const { pending, settled } = parsed as Partial<OutboxState>
    return {
      pending: Array.isArray(pending) ? pending.filter(isEntry) : [],
      settled: Array.isArray(settled) ? settled.filter(isEntry) : [],
    }
  } catch {
    return EMPTY_OUTBOX
  }
}

export function saveOutbox(state: OutboxState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage pieno o disabilitato: le modifiche restano in memoria.
  }
}

let counter = 0

/**
 * Una voce nuova, con un'identità che due schede non si possono contendere.
 *
 * `entryId` è diventato **portante per la correttezza**: è la chiave con cui il
 * salvataggio decide quali voci togliere dalla coda (→ ADR-0070) e con cui la
 * potatura decide quali tenere (→ ADR-0069). Prima non lo era — la coda si
 * azzerava invece di filtrarsi — e `${now}-${counter}` bastava.
 *
 * Non basta più: il contatore vive **per scheda**, quindi due schede dello stesso
 * browser (che condividono `localStorage`) alla loro prima voce nello stesso
 * millisecondo producono lo stesso id, e il salvataggio dell'una toglierebbe dalla
 * coda la voce dell'altra senza averla scritta — cioè il difetto che ADR-0070
 * cura, rientrato dalla finestra. Serve che due azioni umane cadano nello stesso
 * millisecondo in due schede, quindi non è mai successo; ma il costo di
 * escluderlo sono tre byte, e il costo di non escluderlo è una spesa persa senza
 * un segno. Le voci vecchie restano valide: l'id non si interpreta, si confronta.
 */
export function newEntry(op: Op, now: number): OutboxEntry {
  counter += 1
  return { ...op, entryId: `${now}-${counter}-${randomHex(3)}`, ts: now }
}

/** Applica le operazioni in ordine cronologico. */
export function applyOps(dataset: Dataset, entries: readonly OutboxEntry[]): Dataset {
  if (entries.length === 0) return dataset

  let expenses = dataset.expenses
  let tricounts = dataset.tricounts
  let settlements = dataset.settlements ?? []
  let prices = dataset.prices ?? []
  /* Copia solo se serve: il caso normale è una coda vuota o di soli patch. */
  let expensesTouched = false
  let tricountsTouched = false
  let settlementsTouched = false
  let pricesTouched = false

  const byId = new Map(expenses.map((e, index) => [e.id, index]))

  for (const entry of [...entries].sort((a, b) => a.ts - b.ts)) {
    switch (entry.kind) {
      case 'patch':
      case 'update': {
        const index = byId.get(entry.expenseId)
        if (index === undefined) break
        if (!expensesTouched) {
          expenses = [...expenses]
          expensesTouched = true
        }
        const current = expenses[index]
        if (!current) break
        expenses[index] =
          entry.kind === 'patch' ? applyPatch(current, entry) : normalize({ ...current, ...entry.fields })
        break
      }
      case 'create': {
        if (byId.has(entry.expense.id)) break
        if (!expensesTouched) {
          expenses = [...expenses]
          expensesTouched = true
        }
        byId.set(entry.expense.id, expenses.length)
        expenses.push(normalize(entry.expense))
        break
      }
      case 'delete': {
        if (!byId.has(entry.expenseId)) break
        expenses = expenses.filter((e) => e.id !== entry.expenseId)
        expensesTouched = true
        /* Gli indici sono cambiati: si rifà la mappa invece di tenerne una bugiarda. */
        byId.clear()
        expenses.forEach((e, index) => byId.set(e.id, index))
        break
      }
      case 'tricount': {
        if (tricounts.some((t) => t.id === entry.tricount.id)) break
        if (!tricountsTouched) {
          tricounts = [...tricounts]
          tricountsTouched = true
        }
        tricounts.push(entry.tricount)
        break
      }
      case 'tricount-edit': {
        const index = tricounts.findIndex((t) => t.id === entry.tricountId)
        if (index < 0) break
        if (!tricountsTouched) {
          tricounts = [...tricounts]
          tricountsTouched = true
        }
        const current = tricounts[index]
        if (!current) break
        tricounts[index] = normalizeTricount({ ...current, ...entry.fields })
        break
      }
      case 'recategorize': {
        if (!expenses.some((e) => e.category === entry.from)) break
        expenses = expenses.map((e) =>
          e.category === entry.from
            ? /* La sottocategoria appartiene alla categoria di partenza: portarla
                 nella nuova la lascerebbe orfana, e l'interfaccia mostrerebbe un
                 id grezzo al posto di un'etichetta. */
              normalize({ ...e, category: entry.to, subcategory: undefined })
            : e,
        )
        /* `map` conserva ordine e lunghezza, quindi `byId` resta valida: non si
           ricostruisce come dopo un `delete`. */
        expensesTouched = true
        break
      }
      case 'settle': {
        if (settlements.some((s) => s.id === entry.settlement.id)) break
        if (!settlementsTouched) {
          settlements = [...settlements]
          settlementsTouched = true
        }
        settlements.push(entry.settlement)
        break
      }
      case 'unsettle': {
        if (!settlements.some((s) => s.id === entry.settlementId)) break
        settlements = settlements.filter((s) => s.id !== entry.settlementId)
        settlementsTouched = true
        break
      }
      case 'price': {
        if (prices.some((p) => p.id === entry.entry.id)) break
        if (!pricesTouched) {
          prices = [...prices]
          pricesTouched = true
        }
        prices.push(normalizePrice(entry.entry))
        break
      }
      case 'price-delete': {
        if (!prices.some((p) => p.id === entry.priceId)) break
        prices = prices.filter((p) => p.id !== entry.priceId)
        pricesTouched = true
        break
      }
    }
  }

  if (!expensesTouched && !tricountsTouched && !settlementsTouched && !pricesTouched) return dataset
  return { ...dataset, expenses, tricounts, settlements, prices }
}

/**
 * Le operazioni che riscrivono la configurazione, applicate a parte.
 *
 * Sono un applicatore separato e non un ramo di `applyOps` perché lavorano su un
 * **altro file**: la configurazione e le spese vivono in due envelope cifrati
 * distinti, e mescolarli qui vorrebbe dire riscrivere ogni volta anche quello
 * che non è cambiato — con un IV nuovo a ogni cifratura, cioè un file diverso a
 * ogni salvataggio anche senza modifiche.
 */
export function applyConfigOps(config: AppConfig, entries: readonly OutboxEntry[]): AppConfig {
  let next = config
  for (const entry of [...entries].sort((a, b) => a.ts - b.ts)) {
    if (entry.kind === 'categories') {
      next = { ...next, categories: entry.categories }
    } else if (entry.kind === 'income') {
      next = { ...next, income: { ...next.income, [entry.person]: entry.profile } }
    }
  }
  return next
}

/**
 * Le operazioni sulle carte, applicate al **loro** file.
 *
 * Un applicatore a parte per la stessa ragione di `applyConfigOps`: le carte
 * vivono in un envelope cifrato loro, e mescolarle qui vorrebbe dire riscrivere
 * ogni volta anche ciò che non è cambiato — con un IV nuovo a ogni cifratura,
 * cioè un file diverso a ogni salvataggio anche senza modifiche. → ADR-0082,
 * ADR-0025
 */
export function applyCardOps(file: CardsFile, entries: readonly OutboxEntry[]): CardsFile {
  /* Una copia e basta: sono poche decine di carte, e il copy-on-write non paga.
     `touched` serve solo a restituire lo stesso oggetto quando niente è cambiato. */
  const cards = [...file.cards]
  let touched = false

  for (const entry of [...entries].sort((a, b) => a.ts - b.ts)) {
    switch (entry.kind) {
      case 'card': {
        if (cards.some((c) => c.id === entry.card.id)) break
        cards.push(normalizeCard(entry.card))
        touched = true
        break
      }
      case 'card-edit': {
        const index = cards.findIndex((c) => c.id === entry.cardId)
        const current = cards[index]
        if (current === undefined) break
        cards[index] = normalizeCard({ ...current, ...entry.fields })
        touched = true
        break
      }
      case 'card-delete': {
        const index = cards.findIndex((c) => c.id === entry.cardId)
        if (index < 0) break
        cards.splice(index, 1)
        touched = true
        break
      }
      default:
        break
    }
  }

  if (!touched) return file
  return { ...file, cards, updatedAt: new Date().toISOString() }
}

/**
 * Come `normalize` per le spese, e con la stessa trappola: **un campo si
 * cancella con la stringa vuota, non con `undefined`**.
 *
 * Un `card-edit` si applica come `{ ...carta, ...campi }`, quindi un campo
 * assente vuol dire «lascia com'era»; e `JSON.stringify` butta via le chiavi
 * `undefined`, mentre la coda vive in `localStorage`. Con `undefined` bastava un
 * ricaricamento perché una nota cancellata tornasse. Vale per `note`, `image` e
 * `color` — i tre campi che si possono togliere.
 */
function normalizeCard(card: LoyaltyCard): LoyaltyCard {
  const code = card.code.trim()
  const next: LoyaltyCard = {
    ...card,
    name: card.name.trim(),
    /*
     * Il Code 39 **non ha le minuscole**, e il disegnatore le alza da sé. Se il
     * dato le conservasse, il lettore alla cassa restituirebbe un testo diverso
     * da quello salvato: il numero a schermo dice `ab12`, la cassa legge
     * `AB12`. È il difetto peggiore possibile qui — sbagliato invece che
     * assente — e si chiude alzandole nel dato, che è anche la verità: quel
     * codice **è** maiuscolo. → ADR-0083
     */
    code: card.format === 'code39' ? code.toUpperCase() : code,
  }
  if (next.note !== undefined && next.note.trim() === '') delete next.note
  else if (next.note !== undefined) next.note = next.note.trim()
  if (!next.image) delete next.image
  if (!next.color) delete next.color
  return next
}

/**
 * Come `normalize` per le spese: il testo arriva ripulito e una nota vuota non
 * si scrive. Il trim non è cosmetico — `nameKey` normalizza in lettura, ma la
 * grafia salvata è quella che poi si vede nei suggerimenti e nei titoli.
 */
function normalizePrice(entry: PriceEntry): PriceEntry {
  const next: PriceEntry = {
    ...entry,
    product: entry.product.trim(),
    store: entry.store.trim(),
  }
  if (next.note !== undefined && next.note.trim() === '') delete next.note
  else if (next.note !== undefined) next.note = next.note.trim()
  return next
}

/** Come `normalize` per le spese: un flag falso non si scrive. */
function normalizeTricount(tricount: Tricount): Tricount {
  const next: Tricount = { ...tricount }
  if (next.closed !== true) delete next.closed
  if (next.project !== true) delete next.project
  /* La stringa vuota è come per `subcategory`: un `tricount-edit` si applica
     come `{ ...tricount, ...campi }`, quindi per **togliere** la categoria del
     mutuo bisogna dire qualcosa, e `undefined` non sopravvive a
     `JSON.stringify` nella coda in localStorage. */
  if (next.recurringCategory !== undefined && next.recurringCategory.trim() === '') {
    delete next.recurringCategory
  }
  if (next.trip?.country !== undefined && next.trip.country.trim() === '') {
    const { country: _drop, ...rest } = next.trip
    next.trip = rest
  }
  return next
}

function applyPatch(expense: Expense, patch: Annotation): Expense {
  const next: Expense = { ...expense }
  if (patch.tax730 !== undefined) next.tax730 = patch.tax730
  /* Ritagliato qui, perché `isAlreadyApplied` confronta col valore ritagliato:
     salvarlo grezzo renderebbe l'operazione irriconoscibile per sempre. */
  if (patch.notes !== undefined) next.notes = patch.notes.trim()
  if (patch.receiptLinks !== undefined) next.receiptLinks = patch.receiptLinks
  if (patch.welfare !== undefined) next.welfare = patch.welfare
  return normalize(next)
}

/**
 * Togliamo i campi vuoti: il JSON resta pulito e i diff leggibili.
 *
 * `subcategory` cade anche se è la **stringa vuota**, e non è un dettaglio: un
 * `update` si applica come `{ ...spesa, ...campi }`, quindi un campo assente
 * vuol dire «lascia com'era» e per cancellarlo bisogna dire qualcosa. Dire
 * `undefined` non basta — `JSON.stringify` lo butta via, e la coda vive in
 * localStorage. La stringa vuota sopravvive al salvataggio e vuol dire «togli».
 *
 * Il campo `trip` non c'è più in questa danza, ed è una conseguenza voluta del
 * modello: `tricount` è sempre presente e non vuoto, quindi spostare una spesa
 * è riscrivere un campo, non tenerne due d'accordo. → ADR-0037
 */
function normalize(expense: Expense): Expense {
  const next: Expense = { ...expense }
  if (next.tax730 === false) delete next.tax730
  if (next.welfare === false) delete next.welfare
  if (next.offBudget === false) delete next.offBudget
  if (next.notes !== undefined && next.notes.trim() === '') delete next.notes
  if (next.receiptLinks !== undefined && next.receiptLinks.length === 0) delete next.receiptLinks
  if (!next.subcategory) delete next.subcategory
  if (next.shares.others !== undefined && toCents(next.shares.others) === 0) {
    const { others: _drop, ...rest } = next.shares
    next.shares = rest
  }
  return next
}

function sameLinks(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  const left = a ?? []
  const right = b ?? []
  return left.length === right.length && left.every((v, i) => v === right[i])
}

/**
 * Il contenuto remoto con cui si confronta la coda: **tutti e tre i file**.
 *
 * Le chiavi sono obbligatorie anche quando il valore può essere `undefined`, e
 * non è pedanteria: un file nuovo aggiunto qui rompe la compilazione di ogni
 * chiamante, che è l'unico modo di non dimenticarne uno. Dimenticarlo non darebbe
 * un errore ma un fantasma — le operazioni su quel file risulterebbero «non
 * ancora applicate» per sempre e `pruneSettled` le riapplicherebbe a ogni
 * caricamento, riportando a schermo una carta cancellata. → ADR-0082, ADR-0069
 *
 * `undefined` vuol dire «non lo so», e la risposta prudente è «non ancora
 * applicata»: una voce di troppo si riapplica senza danno, una buttata via è
 * persa.
 */
export interface RemoteView {
  dataset: Dataset
  config: AppConfig | undefined
  cards: readonly LoyaltyCard[] | undefined
}

/**
 * true quando ciò che è stato scaricato riflette già questa operazione.
 *
 * Vuole **tutti** i file: da quando la coda tocca anche le categorie, le entrate
 * e le carte, guardare solo il dataset direbbe «non ancora applicata» per sempre
 * alle altre, e quelle voci resterebbero in coda a vita.
 */
export function isAlreadyApplied(remote: RemoteView, entry: OutboxEntry): boolean {
  const { dataset, config, cards } = remote
  switch (entry.kind) {
    case 'patch': {
      const expense = dataset.expenses.find((e) => e.id === entry.expenseId)
      if (!expense) return false
      if (entry.tax730 !== undefined && (expense.tax730 ?? false) !== entry.tax730) return false
      if (entry.notes !== undefined && (expense.notes ?? '') !== entry.notes.trim()) return false
      if (entry.receiptLinks !== undefined && !sameLinks(expense.receiptLinks, entry.receiptLinks))
        return false
      if (entry.welfare !== undefined && (expense.welfare ?? false) !== entry.welfare) return false
      return true
    }
    case 'create':
      return dataset.expenses.some((e) => e.id === entry.expense.id)
    case 'update': {
      const expense = dataset.expenses.find((e) => e.id === entry.expenseId)
      if (!expense) return false
      /* Si confronta con l'**intenzione normalizzata**, non col valore grezzo:
         `subcategory: ''` significa «togli il dettaglio», e una spesa che non ce
         l'ha più soddisfa quell'operazione anche se le stringhe non coincidono. */
      const wanted = normalize({ ...expense, ...entry.fields })
      return Object.keys(entry.fields).every(
        (key) =>
          JSON.stringify(expense[key as keyof Expense]) ===
          JSON.stringify(wanted[key as keyof Expense]),
      )
    }
    case 'delete':
      return !dataset.expenses.some((e) => e.id === entry.expenseId)
    case 'tricount':
      return dataset.tricounts.some((t) => t.id === entry.tricount.id)
    case 'tricount-edit': {
      const tricount = dataset.tricounts.find((t) => t.id === entry.tricountId)
      if (!tricount) return false
      /* Come per `update`: si confronta con l'**intenzione normalizzata**, non col
         valore grezzo. `applyOps` passa da `normalizeTricount`, che cancella
         `closed` quando è falso — quindi «riapri una vacanza» (`{ closed: false }`)
         confrontato grezzo non è mai riconosciuto come applicato
         (`JSON.stringify(undefined) !== 'false'`) e resta in coda quattordici
         giorni, riapplicandosi a ogni caricamento. */
      const wanted = normalizeTricount({ ...tricount, ...entry.fields })
      return Object.keys(entry.fields).every(
        (key) =>
          JSON.stringify(tricount[key as keyof Tricount]) ===
          JSON.stringify(wanted[key as keyof Tricount]),
      )
    }
    case 'settle':
      return (dataset.settlements ?? []).some((s) => s.id === entry.settlement.id)
    case 'unsettle':
      return !(dataset.settlements ?? []).some((s) => s.id === entry.settlementId)
    case 'price':
      return (dataset.prices ?? []).some((p) => p.id === entry.entry.id)
    case 'price-delete':
      return !(dataset.prices ?? []).some((p) => p.id === entry.priceId)
    case 'recategorize':
      return !dataset.expenses.some((e) => e.category === entry.from)
    case 'categories':
      /* Senza configurazione non si può dire: meglio «non ancora» — una voce di
         troppo si riapplica senza danno, una buttata via è persa. */
      if (!config) return false
      return JSON.stringify(config.categories) === JSON.stringify(entry.categories)
    case 'income': {
      if (!config) return false
      return JSON.stringify(config.income[entry.person]) === JSON.stringify(entry.profile)
    }
    case 'card':
      /* Senza il file delle carte non si può dire: «non ancora», come per la
         configurazione. Capita davvero, e non solo prima che sia scaricato — il
         file può non esistere ancora nel repo, il giorno della prima carta. */
      if (!cards) return false
      return cards.some((c) => c.id === entry.card.id)
    case 'card-edit': {
      if (!cards) return false
      const card = cards.find((c) => c.id === entry.cardId)
      if (!card) return false
      /* Come per `update` e `tricount-edit`: si confronta con l'**intenzione
         normalizzata**. `note: ''` vuol dire «togli la nota», e una carta che
         non ce l'ha più soddisfa quell'operazione anche se le stringhe non
         coincidono. Grezzo, quella voce non sarebbe mai riconosciuta come
         applicata e resterebbe in coda quattordici giorni. */
      const wanted = normalizeCard({ ...card, ...entry.fields })
      return Object.keys(entry.fields).every(
        (key) =>
          JSON.stringify(card[key as keyof LoyaltyCard]) ===
          JSON.stringify(wanted[key as keyof LoyaltyCard]),
      )
    }
    case 'card-delete':
      if (!cards) return false
      return !cards.some((c) => c.id === entry.cardId)
  }
}

/**
 * Il bersaglio di un'operazione: quelle sullo stesso bersaglio si potano insieme.
 *
 * Serve solo a `pruneSettled`, e la ragione è in quella funzione: due operazioni
 * sulla stessa cosa possono annullarsi, e potate una per una si annullano male.
 */
function targetOf(entry: OutboxEntry): string {
  switch (entry.kind) {
    case 'patch':
    case 'update':
    case 'delete':
      return `spesa:${entry.expenseId}`
    case 'create':
      return `spesa:${entry.expense.id}`
    case 'tricount':
      return `tricount:${entry.tricount.id}`
    case 'tricount-edit':
      return `tricount:${entry.tricountId}`
    case 'settle':
      return `rimborso:${entry.settlement.id}`
    case 'unsettle':
      return `rimborso:${entry.settlementId}`
    case 'price':
      return `prezzo:${entry.entry.id}`
    case 'price-delete':
      return `prezzo:${entry.priceId}`
    case 'recategorize':
      return `categoria:${entry.from}`
    case 'categories':
      return 'config:categorie'
    case 'income':
      return `config:entrate:${entry.person}`
    case 'card':
      return `carta:${entry.card.id}`
    case 'card-edit':
    case 'card-delete':
      return `carta:${entry.cardId}`
  }
}

/**
 * Scarta le voci già pubblicate (o troppo vecchie per essere ancora in volo).
 *
 * **Si pota per bersaglio, non per voce**, e non è un dettaglio di efficienza: è
 * la correzione di un difetto che faceva riapparire una spesa cancellata.
 *
 * La vecchia versione chiedeva a ogni voce, da sola, «il remoto ti riflette
 * già?». Su due operazioni che si annullano — aggiungi una spesa, poi cancellala,
 * entrambe committate — la logica si capovolge: il remoto non ha la spesa, quindi
 * il `delete` risulta applicato **e viene scartato**, mentre il `create` risulta
 * *non* applicato **e viene tenuto**. Resta in coda il solo `create`, che ogni
 * sovrapposizione riapplica: la spesa cancellata torna a schermo, contata in
 * margine, saldo e statistiche. E ricancellarla non serve — la nuova `delete`
 * viene potata allo stesso modo e il fantasma ritorna, per quattordici giorni.
 * Lo stesso vale per «registra un rimborso e annullalo» (che sposta il saldo
 * mostrato dell'intero importo), per una spunta accesa e spenta, e per un importo
 * corretto due volte.
 *
 * La cura è guardare la **catena** invece della voce: le operazioni su un
 * bersaglio si ordinano per `ts`, e **conta solo l'ultima**, perché è l'unica che
 * dice come quella cosa deve stare adesso. Se il remoto la riflette, tutta la
 * catena è arrivata e si scarta insieme; se non la riflette si tiene insieme, e
 * riapplicare le precedenti in ordine è innocuo (`applyOps` le ordina e le
 * operazioni superate non trovano niente da fare).
 */
export function pruneSettled(state: OutboxState, remote: RemoteView, now: number): OutboxState {
  const fresh = state.settled.filter((entry) => now - entry.ts < SETTLED_TTL_MS)

  const chains = new Map<string, OutboxEntry[]>()
  for (const entry of fresh) {
    const key = targetOf(entry)
    const chain = chains.get(key)
    if (chain) chain.push(entry)
    else chains.set(key, [entry])
  }

  const keep = new Set<string>()
  for (const chain of chains.values()) {
    /* L'ultima per `ts`, non l'ultima inserita: la coda vive in localStorage e
       due schede possono averci scritto in ordine diverso da quello del tempo. */
    const last = chain.reduce((a, b) => (b.ts >= a.ts ? b : a))
    if (!isAlreadyApplied(remote, last)) {
      for (const entry of chain) keep.add(entry.entryId)
    }
  }

  const settled = state.settled.filter((entry) => keep.has(entry.entryId))
  if (settled.length === state.settled.length) return state
  return { ...state, settled }
}

export function pendingCount(state: OutboxState): number {
  return state.pending.length
}

/**
 * Il vocabolario con cui un'operazione diventa parole nel messaggio di commit.
 *
 * È **esportato** perché lo legge anche `domain/changes.ts`, che dai messaggi
 * ricostruisce cosa è successo per la campanella delle novità. Le due direzioni
 * devono restare d'accordo: scriverle due volte vorrebbe dire che il giorno in
 * cui si aggiunge un'operazione la campanella smette di riconoscerla — in
 * silenzio, mostrando una riga senza gruppo invece di un errore. C'è un test di
 * parità che percorre il giro completo per tutti i tipi.
 *
 * Prima e seconda voce: singolare e plurale. Coincidono dove la lingua non
 * distingue («categorie aggiornate»), ed è lecito: la mappa inversa cerca in
 * entrambe.
 */
export const OP_WORDS: Record<Op['kind'], [string, string]> = {
  create: ['spesa aggiunta', 'spese aggiunte'],
  update: ['spesa corretta', 'spese corrette'],
  delete: ['spesa eliminata', 'spese eliminate'],
  patch: ['annotazione', 'annotazioni'],
  tricount: ['tricount nuovo', 'tricount nuovi'],
  'tricount-edit': ['tricount modificato', 'tricount modificati'],
  settle: ['rimborso registrato', 'rimborsi registrati'],
  unsettle: ['rimborso annullato', 'rimborsi annullati'],
  price: ['prezzo rilevato', 'prezzi rilevati'],
  'price-delete': ['rilevazione eliminata', 'rilevazioni eliminate'],
  categories: ['categorie aggiornate', 'categorie aggiornate'],
  recategorize: ['categoria svuotata', 'categorie svuotate'],
  income: ['entrate aggiornate', 'entrate aggiornate'],
  card: ['carta aggiunta', 'carte aggiunte'],
  'card-edit': ['carta modificata', 'carte modificate'],
  'card-delete': ['carta eliminata', 'carte eliminate'],
}

/** Riassunto per il messaggio di commit. */
export function describeOps(entries: readonly OutboxEntry[]): string {
  const counts = new Map<Op['kind'], number>()
  for (const entry of entries) counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1)
  const words = OP_WORDS
  const parts: string[] = []
  for (const [kind, count] of counts) {
    const [one, many] = words[kind]
    parts.push(`${count} ${count === 1 ? one : many}`)
  }
  return parts.join(', ')
}
