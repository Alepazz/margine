/**
 * Le novità: chi ha cambiato cosa nei dati condivisi, e quando.
 *
 * **Lo storico non è un campo nei dati, sono i commit.** Ogni scrittura
 * dell'app finisce in un commit il cui messaggio lo genera `describeOps` e il
 * cui autore è chi ha usato il proprio token: chi-cosa-quando è già scritto, in
 * un posto che git tiene meglio di qualunque campo aggiunto a `Dataset` — senza
 * migrazione, e retroattivo su tutto ciò che è già successo. → ADR-0051
 *
 * Qui dentro non si va in rete: si riceve la lista dei commit già scaricata e
 * la si traduce. È la parte testabile, ed è tutta la logica che c'è.
 */

import { OP_WORDS } from '../data/outbox'
import type { Op } from '../data/outbox'
import type { ExpenseDelta } from './diff'

/**
 * Il suffisso che l'app aggiunge a ogni suo messaggio di commit.
 *
 * È il filtro che distingue **le scritture fatte dall'interfaccia** da tutto il
 * resto della storia del repo: i commit di codice, e quelli della sessione di
 * import dal Mac (`npm run encrypt`), che non ce l'hanno. Senza questo filtro
 * la campanella direbbe «il foglio di dettaglio ha un corpo che scorre», che
 * non è una novità sulle spese di nessuno.
 */
export const APP_COMMIT_SUFFIX = ' (da Margine)'

export type ChangeGroup = 'spese' | 'prezzi' | 'carte' | 'tricount' | 'config'

export const CHANGE_GROUPS: readonly ChangeGroup[] = [
  'spese',
  'prezzi',
  'carte',
  'tricount',
  'config',
]

export const GROUP_LABELS: Record<ChangeGroup, string> = {
  spese: 'Spese',
  prezzi: 'Prezzi',
  carte: 'Carte fedeltà',
  tricount: 'Tricount e rimborsi',
  config: 'Categorie ed entrate',
}

/** A quale spunta di Impostazioni risponde ciascuna operazione. */
const GROUP_OF: Record<Op['kind'], ChangeGroup> = {
  create: 'spese',
  update: 'spese',
  delete: 'spese',
  patch: 'spese',
  price: 'prezzi',
  'price-delete': 'prezzi',
  card: 'carte',
  'card-edit': 'carte',
  'card-delete': 'carte',
  tricount: 'tricount',
  'tricount-edit': 'tricount',
  settle: 'tricount',
  unsettle: 'tricount',
  categories: 'config',
  recategorize: 'config',
  income: 'config',
}

/** Un commit come lo restituisce l'API, ridotto a ciò che serve qui. */
export interface RawCommit {
  sha: string
  message: string
  /** `commit.author.login`: manca se l'autore git non è collegato a un account. */
  login: string | null
  /** Il nome dell'autore git: il ripiego quando il login non c'è. */
  name: string
  /** ISO datetime. */
  date: string
  /** Lo sha del primo genitore: la versione con cui confrontare. `null` sul primo commit. */
  parent: string | null
}

export interface Change {
  sha: string
  at: string
  /** Login se c'è, altrimenti il nome: è solo per distinguere le persone. */
  who: string
  /** Il messaggio senza il suffisso: «2 spese aggiunte, 1 prezzo rilevato». */
  summary: string
  /** I gruppi toccati, senza ripetizioni e nell'ordine di `CHANGE_GROUPS`. */
  groups: ChangeGroup[]
  /** Con cosa confrontare per sapere quali spese ha toccato. */
  parent: string | null
  /** Quante cose ha toccato: il contributo di questa riga al numero sul pallino. */
  count: number
  /** Le operazioni dentro, per scriverne le frasi senza rileggere il messaggio. */
  parts: SummaryPart[]
}

/**
 * La mappa inversa del vocabolario, costruita da `OP_WORDS` invece che
 * riscritta: è ciò che impedisce alle due direzioni di divergere.
 */
const KIND_OF_WORDS = (() => {
  const map = new Map<string, Op['kind']>()
  for (const [kind, [one, many]] of Object.entries(OP_WORDS) as [Op['kind'], [string, string]][]) {
    map.set(one, kind)
    map.set(many, kind)
  }
  return map
})()

/** Un pezzo di messaggio riconosciuto: «2 spese aggiunte» → `create` ×2. */
export interface SummaryPart {
  kind: Op['kind']
  count: number
}

/**
 * Le operazioni dentro un messaggio come «2 spese aggiunte, 1 prezzo rilevato».
 *
 * Una parte che non si riconosce viene **ignorata**, non fatta diventare un
 * ripiego: un messaggio scritto a mano che finisse per caso con il suffisso non
 * deve inventarsi un'operazione. Se nessuna parte si riconosce il risultato è
 * vuoto, e chi chiama decide cosa farne.
 */
export function partsOfSummary(summary: string): SummaryPart[] {
  const out: SummaryPart[] = []
  for (const chunk of summary.split(',')) {
    const match = /^\s*(\d+)\s+(.+?)\s*$/.exec(chunk)
    if (!match) continue
    const kind = KIND_OF_WORDS.get(match[2]!)
    if (kind) out.push({ kind, count: Number(match[1]) })
  }
  return out
}

export function groupsOfSummary(summary: string): ChangeGroup[] {
  const found = new Set(partsOfSummary(summary).map((part) => GROUP_OF[part.kind]))
  return CHANGE_GROUPS.filter((group) => found.has(group))
}

/**
 * Quante cose ha toccato un commit: è il numero sulla campanella.
 *
 * Si ricava **dal messaggio**, quindi si sa senza scaricare il dettaglio. È la
 * ragione per cui il pallino può contare le spese e non i salvataggi senza
 * costare una richiesta: «3 spese aggiunte» sono tre, e lo dice il testo.
 */
export function countOfSummary(summary: string): number {
  return partsOfSummary(summary).reduce((total, part) => total + part.count, 0)
}

/** Le operazioni che riguardano una spesa: per queste il dettaglio esiste. */
export const EXPENSE_KINDS: ReadonlySet<Op['kind']> = new Set<Op['kind']>([
  'create',
  'update',
  'delete',
  'patch',
])

/**
 * Vero se in questo commit c'è almeno un'operazione su una spesa.
 *
 * Serve a **non scaricare niente** per i commit che non ne hanno: il dettaglio
 * di una novità costa due file cifrati da 367 kB (→ ADR-0051), e per un commit
 * di sola lista, prezzi, carte, tricount o configurazione il confronto fra le
 * due versioni è vuoto **per costruzione** — non perché non ci sia niente, ma
 * perché quel file non è stato toccato.
 *
 * Il difetto era preesistente e costava poco finché l'app scriveva tre commit
 * al giorno. Con la lista della spesa, dove ogni cosa presa è un commit, una
 * spesa di venti voci fa scaricare qualche megabyte per non dire niente e morde
 * le sessanta richieste all'ora che GitHub concede senza token — che è il modo
 * in cui la campanella diventa muta senza poterlo spiegare (→ ADR-0053). Le
 * cifre misurate stanno nell'ADR.
 *
 * Sta qui e non nello store perché è una domanda sul **messaggio**: si risponde
 * senza rete, ed è quello che la rende utile. → ADR-0087
 */
export function touchesExpenses(change: Change): boolean {
  return change.parts.some((part) => EXPENSE_KINDS.has(part.kind))
}

/**
 * Il verbo, per scriverci una frase invece di un'etichetta.
 *
 * `OP_WORDS` dice «spesa aggiunta», che va bene in un messaggio di commit e
 * male in una notifica: «Federica ha aggiunto una spesa» si legge, «Federica ·
 * 1 spesa aggiunta» si decifra. Sono due registri diversi della stessa cosa, e
 * questa è la seconda coniugazione — non una duplicazione, una traduzione. Il
 * test di parità copre anche questa tabella. → ADR-0052
 *
 * `{n}` si sostituisce col numero. Dove la lingua non distingue, le due voci
 * coincidono.
 */
export const PHRASES: Record<Op['kind'], [string, string]> = {
  create: ['ha aggiunto una spesa', 'ha aggiunto {n} spese'],
  update: ['ha corretto una spesa', 'ha corretto {n} spese'],
  delete: ['ha eliminato una spesa', 'ha eliminato {n} spese'],
  patch: ['ha annotato una spesa', 'ha annotato {n} spese'],
  tricount: ['ha creato un tricount', 'ha creato {n} tricount'],
  'tricount-edit': ['ha modificato un tricount', 'ha modificato {n} tricount'],
  settle: ['ha registrato un rimborso', 'ha registrato {n} rimborsi'],
  unsettle: ['ha annullato un rimborso', 'ha annullato {n} rimborsi'],
  price: ['ha rilevato un prezzo', 'ha rilevato {n} prezzi'],
  'price-delete': ['ha eliminato una rilevazione', 'ha eliminato {n} rilevazioni'],
  card: ['ha aggiunto una carta', 'ha aggiunto {n} carte'],
  'card-edit': ['ha modificato una carta', 'ha modificato {n} carte'],
  'card-delete': ['ha eliminato una carta', 'ha eliminato {n} carte'],
  categories: ['ha aggiornato le categorie', 'ha aggiornato le categorie'],
  recategorize: ['ha svuotato una categoria', 'ha svuotato {n} categorie'],
  income: ['ha aggiornato le entrate', 'ha aggiornato le entrate'],
}

/** «Federica ha rilevato 2 prezzi». Il soggetto lo mette chi chiama. */
export function phraseOf(part: SummaryPart): string {
  const [one, many] = PHRASES[part.kind]
  return part.count === 1 ? one : many.replace('{n}', String(part.count))
}

export interface ParseOptions {
  /**
   * Il mio login GitHub. I miei commit non sono novità: li ho appena fatti io.
   * Se è `undefined` — nessun token, quindi login ignoto — non si filtra
   * nessuno: meglio un elenco che comprende anche le mie righe di un elenco
   * vuoto senza spiegazione.
   */
  myLogin?: string
  /** I gruppi accesi in Impostazioni. Un commit che non ne tocca nessuno sparisce. */
  groups?: readonly ChangeGroup[]
}

/**
 * Da commit grezzi a novità, dalla più recente alla più vecchia.
 *
 * Tre filtri in fila: solo i commit dell'app, solo quelli di qualcun altro,
 * solo quelli che toccano un gruppo acceso.
 */
export function parseChanges(commits: readonly RawCommit[], options: ParseOptions = {}): Change[] {
  const wanted = new Set(options.groups ?? CHANGE_GROUPS)
  const out: Change[] = []
  for (const commit of commits) {
    /* Solo la prima riga: un messaggio dell'app non ne ha altre, ma un commit
       scritto a mano sì, e il suffisso va cercato dove l'app lo mette. */
    const firstLine = commit.message.split('\n', 1)[0] ?? ''
    if (!firstLine.endsWith(APP_COMMIT_SUFFIX)) continue

    const who = commit.login ?? commit.name
    if (options.myLogin !== undefined && who === options.myLogin) continue

    const summary = firstLine.slice(0, -APP_COMMIT_SUFFIX.length).trim()
    const groups = groupsOfSummary(summary)
    if (!groups.some((group) => wanted.has(group))) continue

    const parts = partsOfSummary(summary)
    out.push({
      sha: commit.sha,
      at: commit.date,
      who,
      summary,
      groups,
      parent: commit.parent,
      parts,
      count: countOfSummary(summary),
    })
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}

/**
 * Le novità arrivate dopo l'ultima apertura della campanella.
 *
 * Il confronto è **stretto**: un commit con l'ora esatta di `seenAt` è già
 * stato visto — è quello che ha fatto scattare il salvataggio del timestamp.
 * Senza `seenAt` (prima apertura, o dati del sito svuotati) è tutto nuovo, ed è
 * giusto: chi arriva non ha visto niente.
 */
export function unseenSince(changes: readonly Change[], seenAt: string | undefined): Change[] {
  if (seenAt === undefined) return [...changes]
  return changes.filter((change) => change.at > seenAt)
}

/**
 * Quante di queste righe non sono ancora state **guardate**.
 *
 * Non è la lunghezza dell'elenco, ed è la differenza che tiene in piedi i due
 * gesti: chiudere il foglio dice «viste» e spegne il pallino, il pulsante dice
 * «archiviate» e svuota l'elenco. Con un segno solo i due gesti erano lo stesso
 * gesto, e o si perdevano le novità aprendo per sbaglio, o il pallino restava
 * acceso su cose già lette. → ADR-0061, ADR-0052
 */
export function unseenCount(
  notices: readonly { at: string }[],
  readAt: string | undefined,
): number {
  if (readAt === undefined) return notices.length
  return notices.filter((notice) => notice.at > readAt).length
}

/** Il numero sul pallino: oltre nove diventa `9+`, che è tutto ciò che serve sapere. */
export function badgeLabel(count: number): string {
  if (count <= 0) return ''
  return count > 9 ? '9+' : String(count)
}

// ─────────────────────── da commit a righe di notifica ───────────────────────

/**
 * Una riga della campanella, in forma strutturale: il testo lo scrive chi
 * disegna, che conosce i nomi delle persone e delle categorie.
 *
 * Sta **qui** e non nel componente perché il numero sul pallino conta le righe:
 * se l'elenco e il conteggio nascessero in due posti diversi, prima o poi
 * direbbero cose diverse — e sarebbe il pallino a mentire, promettendo righe che
 * non ci sono. Una definizione sola, e il conteggio è la sua lunghezza.
 * → ADR-0052
 */
export type NoticeItem =
  /** Una spesa vera, con titolo e importo: il dettaglio è arrivato. */
  | { kind: 'delta'; key: string; sha: string; at: string; who: string; delta: ExpenseDelta }
  /**
   * Ciò che non è (o non è ancora) una spesa con un nome: le altre operazioni,
   * le spese di cui il dettaglio non è arrivato, e quelle che restano fuori dai
   * tricount di chi guarda.
   */
  | {
      kind: 'summary'
      key: string
      sha: string
      at: string
      who: string
      part: SummaryPart
      /** Il dettaglio sta ancora arrivando: la frase è generica per ora. */
      pending?: boolean
      /** Il dettaglio non si è potuto leggere: toccando si riprova. */
      failed?: boolean
    }

/** Cosa si sa del dettaglio di un commit. `deltas` è **già filtrato** per visibilità. */
export interface NewsDetailView {
  deltas?: readonly ExpenseDelta[]
  failed?: boolean
}

/**
 * Le righe della campanella.
 *
 * Una riga per **cosa**, non per salvataggio: tre spese salvate insieme sono un
 * commit solo e tre righe. Le operazioni che non toccano una spesa (prezzi,
 * tricount, categorie) restano una riga ciascuna, e la riga dichiara il proprio
 * numero — «ha rilevato 2 prezzi» sono due cose in una riga, e si legge.
 *
 * **Ciò che sta fuori dai tricount di chi guarda non lascia traccia**: né una
 * riga, né un numero. Non è una svista ed è una scelta di Alessio, contro la
 * prima versione che ne mostrava una che diceva «e 2 fuori dai tuoi tricount»:
 * una notifica per qualcosa che non ti riguarda è rumore, e sapere *che* è
 * successo qualcosa nel compartimento personale dell'altra persona è già più di
 * quanto serva. La separazione qui è più forte che altrove nell'app.
 *
 * Il prezzo, dichiarato: finché il dettaglio non è arrivato non si può sapere
 * che un commit era tutto personale, quindi la riga generica compare e poi
 * sparisce. La finestra è quella di una richiesta, e il caricamento parte da
 * solo appena la lista dei commit atterra. → ADR-0052, ADR-0039
 */
export function noticesOf(
  changes: readonly Change[],
  detailOf: (sha: string) => NewsDetailView,
): NoticeItem[] {
  const out: NoticeItem[] = []
  for (const change of changes) {
    const { deltas, failed } = detailOf(change.sha)
    const base = { sha: change.sha, at: change.at, who: change.who }

    for (const part of change.parts) {
      if (EXPENSE_KINDS.has(part.kind) && deltas !== undefined) continue
      out.push({
        kind: 'summary',
        key: `${change.sha}-${part.kind}`,
        ...base,
        part,
        pending: EXPENSE_KINDS.has(part.kind) && failed !== true ? true : undefined,
        failed: EXPENSE_KINDS.has(part.kind) && failed === true ? true : undefined,
      })
    }

    for (const delta of deltas ?? []) {
      out.push({ kind: 'delta', key: `${change.sha}-${delta.expense.id}`, ...base, delta })
    }

  }
  return out
}
