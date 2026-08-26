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

export type ChangeGroup = 'spese' | 'prezzi' | 'tricount' | 'config'

export const CHANGE_GROUPS: readonly ChangeGroup[] = ['spese', 'prezzi', 'tricount', 'config']

export const GROUP_LABELS: Record<ChangeGroup, string> = {
  spese: 'Spese',
  prezzi: 'Prezzi',
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

/**
 * I gruppi toccati da un messaggio come «2 spese aggiunte, 1 prezzo rilevato».
 *
 * Una parte che non si riconosce viene **ignorata**, non fatta diventare un
 * gruppo di ripiego: un messaggio scritto a mano che finisse per caso con il
 * suffisso non deve inventarsi una categoria. Se nessuna parte si riconosce il
 * risultato è vuoto, e chi chiama decide cosa farne.
 */
export function groupsOfSummary(summary: string): ChangeGroup[] {
  const found = new Set<ChangeGroup>()
  for (const part of summary.split(',')) {
    const match = /^\s*\d+\s+(.+?)\s*$/.exec(part)
    if (!match) continue
    const kind = KIND_OF_WORDS.get(match[1]!)
    if (kind) found.add(GROUP_OF[kind])
  }
  return CHANGE_GROUPS.filter((group) => found.has(group))
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

    out.push({ sha: commit.sha, at: commit.date, who, summary, groups, parent: commit.parent })
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

/** Il numero sul pallino: oltre nove diventa `9+`, che è tutto ciò che serve sapere. */
export function badgeLabel(count: number): string {
  if (count <= 0) return ''
  return count > 9 ? '9+' : String(count)
}
