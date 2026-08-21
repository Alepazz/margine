/**
 * Migrazione della tassonomia al secondo giro (20/08/2026).
 *
 * Sposta le voci che cambiano categoria e riallinea `data/config.json` alla
 * tassonomia di `scripts/lib/taxonomy.mjs`, che resta il **valore iniziale**
 * anche adesso che l'app può riscrivere le categorie.
 *
 * Si esegue una volta e poi non serve più: è tenuto nel repo perché il prossimo
 * spostamento di categorie parta da un esempio funzionante, non da zero.
 *
 *     node scripts/migrate-taxonomy.mjs [--dry]
 *
 * La regola che rende la migrazione verificabile: **nessun euro si muove**. Le
 * spese cambiano etichetta, non importo, quindi il totale generale prima e dopo
 * deve essere identico al centesimo, e ogni voce spostata deve arrivare in una
 * categoria che esiste. Se una delle due cose non torna, lo script non scrive.
 */

import { CATEGORIES } from './lib/taxonomy.mjs'
import { toCents as cents } from './lib/money.mjs'
import { PATHS, log, readJson, writeJson } from './lib/io.mjs'

/**
 * I nomi veri dei tricount **non stanno qui**: sono in `data/config.json`, che è
 * fuori da git, e questo file è nel repo pubblico. Lo script li conserva se ci
 * sono e non ne inventa: sono l'unica cosa in questa migrazione che nessun
 * codice può sapere. → ADR-0026
 */
function keepSources(config, warn) {
  if (config.sources) return config.sources
  warn(
    'config.sources non c’è: i tricount compariranno coi nomi generici. ' +
      'Aggiungili a data/config.json coi nomi e le emoji che leggi su Tricount.',
  )
  return undefined
}

/**
 * Le regole, in ordine: la prima che riconosce la voce vince.
 *
 * `telefonia` si spacca su `source` e non sul titolo perché è il tricount a dire
 * di chi è la spesa: le 40 voci in «Spese casa» sono la linea dell'abitazione,
 * le 11 in «Personale» sono le ricariche di un telefono. Fidarsi dei titoli
 * vorrebbe dire distinguere «Fattura Tim» da «Ricarica Tim» a colpi di sottostringa.
 */
const RULES = [
  {
    what: 'la rete di casa, da «Telefonia» a Casa/Internet e telefono',
    when: (e) => e.category === 'telefonia' && e.source === 'fisse',
    to: { category: 'casa', subcategory: 'internet' },
  },
  {
    what: 'le ricariche personali restano in «Telefono», che cambia solo nome',
    when: (e) => e.category === 'telefonia',
    to: { category: 'telefonia', subcategory: undefined },
  },
  {
    what: 'i treni, da Trasporti/mezzi alla categoria «Treni e mezzi»',
    when: (e) => e.category === 'trasporti' && e.subcategory === 'mezzi',
    to: { category: 'mezzi', subcategory: undefined },
  },
  {
    what: '«Tecnologia», che non esiste più, in Altro',
    when: (e) => e.category === 'tecnologia',
    to: { category: 'altro', subcategory: undefined },
  },
  {
    what: '«Tasse e burocrazia», che non esiste più, in Altro',
    when: (e) => e.category === 'burocrazia',
    to: { category: 'altro', subcategory: undefined },
  },
]

function totalCents(expenses) {
  return expenses.reduce((sum, e) => sum + cents(e.amount), 0)
}

function countByCategory(expenses) {
  const out = new Map()
  for (const e of expenses) {
    const row = out.get(e.category) ?? { count: 0, cents: 0 }
    row.count += 1
    row.cents += cents(e.amount)
    out.set(e.category, row)
  }
  return out
}

function euro(value) {
  return `${(value / 100).toFixed(2)} €`
}

function main() {
  const dry = process.argv.includes('--dry')
  const dataset = readJson(PATHS.expenses)
  /* Questo script parla il modello VECCHIO (source + trips). Sui dati migrati
     al modello a tricount (ADR-0037) non deve fare niente. */
  if (Array.isArray(dataset.tricounts)) {
    log('✗ I dati sono già al modello a tricount: questo script è storia, non si rilancia.')
    process.exitCode = 1
    return
  }
  const config = readJson(PATHS.config)

  const before = countByCategory(dataset.expenses)
  const beforeTotal = totalCents(dataset.expenses)

  const known = new Map(CATEGORIES.map((c) => [c.id, c]))
  const moved = new Map(RULES.map((rule) => [rule.what, { count: 0, cents: 0 }]))
  const problems = []

  const expenses = dataset.expenses.map((expense) => {
    const rule = RULES.find((candidate) => candidate.when(expense))
    if (!rule) return expense

    const target = known.get(rule.to.category)
    if (!target) {
      problems.push(`La regola «${rule.what}» punta a una categoria che non esiste: ${rule.to.category}`)
      return expense
    }
    if (rule.to.subcategory) {
      const subs = target.subcategories ?? []
      if (!subs.some((sub) => sub.id === rule.to.subcategory)) {
        problems.push(
          `La regola «${rule.what}» punta a ${rule.to.category}/${rule.to.subcategory}, che non esiste`,
        )
        return expense
      }
    }

    const tally = moved.get(rule.what)
    tally.count += 1
    tally.cents += cents(expense.amount)

    const next = { ...expense, category: rule.to.category }
    if (rule.to.subcategory) next.subcategory = rule.to.subcategory
    else delete next.subcategory
    return next
  })

  /*
   * Una voce può restare con una sottocategoria che la sua categoria non ha più:
   * `trasporti/mezzi` è il caso di questo giro, ma la trappola è generale e
   * silenziosa — l'etichetta scomparirebbe dall'interfaccia senza un errore.
   */
  for (const expense of expenses) {
    if (!expense.subcategory) continue
    const category = known.get(expense.category)
    const subs = category?.subcategories ?? []
    if (!subs.some((sub) => sub.id === expense.subcategory)) {
      problems.push(`${expense.id}: ${expense.category}/${expense.subcategory} non esiste più`)
    }
    if (!category) problems.push(`${expense.id}: la categoria ${expense.category} non esiste più`)
  }

  const afterTotal = totalCents(expenses)
  if (afterTotal !== beforeTotal) {
    problems.push(
      `Il totale generale è cambiato: ${euro(beforeTotal)} → ${euro(afterTotal)}. Una migrazione di etichette non può spostare un centesimo.`,
    )
  }

  log('Spostamenti')
  for (const [what, tally] of moved) {
    log(`  ${String(tally.count).padStart(4)} voci  ${euro(tally.cents).padStart(12)}  ${what}`)
  }

  const after = countByCategory(expenses)
  log('\nCategorie, prima → dopo')
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort()
  for (const id of ids) {
    const b = before.get(id) ?? { count: 0, cents: 0 }
    const a = after.get(id) ?? { count: 0, cents: 0 }
    if (b.count === a.count && b.cents === a.cents) continue
    const label = known.get(id)?.label ?? '(non esiste più)'
    log(`  ${id.padEnd(15)} ${String(b.count).padStart(4)} → ${String(a.count).padStart(4)}  ${label}`)
  }
  log(`\nTotale generale invariato: ${euro(beforeTotal)}`)

  if (problems.length > 0) {
    log(`\n✗ ${problems.length} problemi, non scrivo niente:`)
    for (const problem of problems.slice(0, 20)) log(`  - ${problem}`)
    process.exitCode = 1
    return
  }

  if (dry) {
    log('\n(--dry: nessun file scritto)')
    return
  }

  const sources = keepSources(config, (message) => log(`⚠ ${message}`))
  writeJson(PATHS.expenses, { ...dataset, expenses, updatedAt: new Date().toISOString() })
  writeJson(PATHS.config, {
    ...config,
    ...(sources ? { sources } : {}),
    categories: CATEGORIES,
  })
  log('\n✓ data/expenses.json e data/config.json aggiornati.')
  log('  Ora: npm run validate, poi npm run encrypt.')
}

main()
