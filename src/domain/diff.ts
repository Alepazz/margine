/**
 * Cosa è cambiato fra due versioni dei dati.
 *
 * È il modo — l'unico — di sapere **quale** spesa ha aggiunto l'altra persona e
 * quanto ammonta. Il messaggio di commit dice solo «1 spesa aggiunta», e deve
 * continuare a dirlo: il repo è pubblico, quindi ciò che finisce in un
 * messaggio è in chiaro per chiunque e per sempre. Titolo, importo e tricount
 * si ricavano **decifrando in locale** due versioni del file e confrontandole,
 * che è la stessa cosa senza pubblicare niente. → ADR-0051
 */

import { isMember, type Dataset, type Expense, type PersonId, type Tricount } from './types'

export interface ExpenseDelta {
  kind: 'added' | 'changed' | 'removed'
  /** La spesa **dopo**, tranne per `removed`, dove è com'era l'ultima volta. */
  expense: Expense
  /** Solo per `changed`: com'era prima, per poter dire cosa si è mosso. */
  before?: Expense
}

/**
 * Un campo di una spesa, `id` escluso: due spese si confrontano **per** id,
 * quindi non può essere fra quelli che si muovono. Le tre tabelle di questo
 * modulo sono indicizzate così, e sono totali su di esso.
 */
type ExpenseField = Exclude<keyof Expense, 'id'>

/**
 * Confronto stabile fra due spese, indipendente dall'ordine delle chiavi.
 *
 * Enumerare i campi a mano sarebbe più leggibile ma si sfalderebbe in silenzio
 * il giorno che se ne aggiunge uno: la spesa risulterebbe «non cambiata» dopo
 * una modifica a quel campo. Ordinare le chiavi non può divergere da `Expense`
 * perché non la nomina.
 */
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`
}

/**
 * Le spese comparse, cambiate e sparite fra due versioni del dataset.
 *
 * L'ordine è: prima le aggiunte, poi le modifiche, poi le eliminazioni, e
 * dentro ciascun gruppo dalla più recente. È l'ordine in cui interessano —
 * «cos'è comparso» prima di «cos'è stato ritoccato».
 */
export function diffExpenses(before: Dataset, after: Dataset): ExpenseDelta[] {
  const old = new Map(before.expenses.map((expense) => [expense.id, expense]))
  const now = new Map(after.expenses.map((expense) => [expense.id, expense]))

  const added: ExpenseDelta[] = []
  const changed: ExpenseDelta[] = []
  const removed: ExpenseDelta[] = []

  for (const [id, expense] of now) {
    const previous = old.get(id)
    if (previous === undefined) added.push({ kind: 'added', expense })
    else if (stable(previous) !== stable(expense)) {
      changed.push({ kind: 'changed', expense, before: previous })
    }
  }
  for (const [id, expense] of old) {
    if (!now.has(id)) removed.push({ kind: 'removed', expense })
  }

  const byDate = (a: ExpenseDelta, b: ExpenseDelta) =>
    a.expense.date < b.expense.date ? 1 : a.expense.date > b.expense.date ? -1 : 0
  return [...added.sort(byDate), ...changed.sort(byDate), ...removed.sort(byDate)]
}

/**
 * Solo le spese dei tricount di cui chi guarda è membro.
 *
 * È la stessa convenzione del resto dell'interfaccia: i menù di inserimento
 * offrono solo i propri tricount, e il compartimento personale dell'altra
 * persona non si mette davanti a nessuno. La passphrase apre tutto — la
 * separazione è una convenzione, non una cassaforte — ma una convenzione che
 * vale ovunque tranne che nella campanella non varrebbe da nessuna parte.
 * → ADR-0039, ADR-0037
 *
 * Ciò che resta fuori **non sparisce**: la riga continua a dire «1 spesa
 * aggiunta», senza il dettaglio. Il fatto che qualcosa sia successo non è
 * segreto; è il contenuto a non essere affare di chi guarda.
 */
export function visibleDeltas(
  deltas: readonly ExpenseDelta[],
  tricounts: readonly Tricount[],
  person: PersonId,
): ExpenseDelta[] {
  const mine = new Set(
    tricounts.filter((tricount) => isMember(tricount, person)).map((tricount) => tricount.id),
  )
  return deltas.filter((delta) => mine.has(delta.expense.tricount))
}

/**
 * Quali campi si sono mossi in una modifica: serve a dire *cosa* è cambiato.
 *
 * Qui i campi si enumerano per forza — servono le etichette in italiano, e
 * `keyof Expense` non le contiene. È l'unico punto del modulo che può restare
 * indietro rispetto al tipo, e il test `FIELD_LABELS li copre tutti` lo
 * presidia: aggiungere un campo a `Expense` senza dargli un'etichetta fa cadere
 * quel test invece di produrre un «modificata» che non dice cosa.
 */
export const FIELD_LABELS: Record<ExpenseField, string> = {
  date: 'data',
  title: 'descrizione',
  amount: 'importo',
  shares: 'divisione',
  paidBy: 'chi ha pagato',
  tricount: 'tricount',
  category: 'categoria',
  subcategory: 'tipo',
  recurring: 'ricorrente',
  notes: 'nota',
  receiptLinks: 'scontrini',
  welfare: 'welfare',
  tax730: '730',
  offBudget: 'capitale',
}

/**
 * Quali campi di una spesa spostano **denaro**, e quali no.
 *
 * Serve alla campanella: una correzione che non muove la cifra non è una
 * novità, è manutenzione. È una scelta di Alessio sui dati veri — «Assicurazione
 * e simili non serve averli come notifica, a meno che non cambi la cifra
 * spesa». → ADR-0094
 *
 * I tre veri sono i tre che spostano soldi **fra le due persone**: quanto,
 * come è diviso, chi ha anticipato. Gli altri muovono un numero da qualche
 * parte — la data sceglie il mese, `recurring` il secchio, `offBudget` se la
 * spesa esiste per i conti — ma non cambiano quanto è stato speso né chi lo
 * deve a chi, e sono esattamente le correzioni che si fanno di continuo: un
 * refuso nel titolo, una categoria sbagliata, una spunta dimenticata.
 *
 * È un record **totale** e non un insieme, di proposito: un campo nuovo in
 * `Expense` non compila finché non si è deciso se è denaro. Un insieme lo
 * avrebbe dato per «non è denaro» in silenzio, che fra i due è il verso
 * sbagliato in cui sbagliare — un importo che si muove senza dirlo. È la stessa
 * ragione per cui `fileOf` e `targetOf` sono esaustive, e non vale per ogni
 * tabella: dove il ripiego è innocuo la totalità è solo cerimonia.
 */
export const MONEY_FIELDS: Record<ExpenseField, boolean> = {
  amount: true,
  shares: true,
  paidBy: true,
  date: false,
  title: false,
  tricount: false,
  category: false,
  subcategory: false,
  recurring: false,
  notes: false,
  receiptLinks: false,
  welfare: false,
  tax730: false,
  offBudget: false,
}

/**
 * Quali campi si sono mossi, come chiavi.
 *
 * Un posto solo a rispondere alla domanda, perché a farsela sono due: chi
 * scrive le etichette e chi cerca il denaro. Con due cicli separati basterebbe
 * che uno dei due trattasse un campo diversamente perché la riga della
 * campanella dicesse «modificata: importo» senza contarlo come denaro.
 */
function movedKeys(delta: ExpenseDelta): ExpenseField[] {
  const before = delta.before
  if (before === undefined) return []
  return (Object.keys(FIELD_LABELS) as ExpenseField[]).filter(
    (key) => stable(before[key]) !== stable(delta.expense[key]),
  )
}

/**
 * Vero se questa novità sposta dei soldi.
 *
 * Una spesa comparsa o sparita ne sposta sempre — c'è un importo in più o in
 * meno. Una **modifica** solo se ha toccato uno dei tre campi del denaro; e
 * una modifica senza il «prima» conta come se li avesse toccati, perché in
 * mancanza dei fatti è meglio una riga di troppo che un importo che si muove
 * in silenzio.
 */
export function movesMoney(delta: ExpenseDelta): boolean {
  if (delta.kind !== 'changed' || delta.before === undefined) return true
  return movedKeys(delta).some((key) => MONEY_FIELDS[key])
}

export function changedFields(delta: ExpenseDelta): string[] {
  return movedKeys(delta).map((key) => FIELD_LABELS[key])
}
