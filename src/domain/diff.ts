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
export const FIELD_LABELS: Record<Exclude<keyof Expense, 'id'>, string> = {
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

export function changedFields(delta: ExpenseDelta): string[] {
  if (delta.before === undefined) return []
  const before = delta.before
  const out: string[] = []
  for (const [key, label] of Object.entries(FIELD_LABELS) as [keyof Expense, string][]) {
    if (stable(before[key]) !== stable(delta.expense[key])) out.push(label)
  }
  return out
}
