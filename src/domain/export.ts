/** Esportazioni per il commercialista: CSV e riepilogo testuale. */

import type { CategoryLookup } from './categories'
import { formatDate } from './dates'
import { formatEuro } from './money'
import type { Tax730Year } from './selectors'
import type { Expense, PersonId } from './types'

function csvCell(value: string | number): string {
  const text = String(value)
  if (/[";\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

/** Punto e virgola e virgola decimale: così Excel in italiano apre il file senza domande. */
export function tax730Csv(
  year: Tax730Year,
  person: PersonId,
  lookup: CategoryLookup,
  personName: string,
): string {
  const header = [
    'Data',
    'Descrizione',
    'Categoria',
    'Dettaglio',
    'Importo totale',
    `Quota ${personName}`,
    'Origine',
    'Note',
    'Scontrini',
  ]
  const rows = year.items.map((expense: Expense) => [
    expense.date,
    expense.title,
    lookup.label(expense.category),
    expense.subcategory ? lookup.subLabel(expense.category, expense.subcategory) : '',
    expense.amount.toFixed(2).replace('.', ','),
    (expense.shares[person] ?? 0).toFixed(2).replace('.', ','),
    lookup.tricountLabel(expense.tricount),
    expense.notes ?? '',
    (expense.receiptLinks ?? []).join(' | '),
  ])
  return [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')
}

export function tax730Summary(
  year: Tax730Year,
  person: PersonId,
  lookup: CategoryLookup,
  personName: string,
): string {
  const lines: string[] = [
    `Spese detraibili ${year.year} — ${personName}`,
    `${year.items.length} voci · quota da portare in detrazione: ${formatEuro(year.share)}`,
    `Scontrini allegati: ${year.withReceipt} su ${year.items.length}`,
    '',
  ]
  for (const expense of [...year.items].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const parts = [
      formatDate(expense.date),
      expense.title,
      `${formatEuro(expense.shares[person] ?? 0)} (totale ${formatEuro(expense.amount)})`,
      lookup.label(expense.category),
    ]
    lines.push(`- ${parts.join(' · ')}`)
    if (expense.notes) lines.push(`  nota: ${expense.notes}`)
    for (const link of expense.receiptLinks ?? []) lines.push(`  scontrino: ${link}`)
  }
  return lines.join('\n')
}
