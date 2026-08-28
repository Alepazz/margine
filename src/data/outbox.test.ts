import { describe, expect, it } from 'vitest'

import {
  applyConfigOps,
  applyOps,
  describeOps,
  isAlreadyApplied,
  pruneSettled,
  touchesConfig,
  type OutboxEntry,
} from './outbox'
import type { AppConfig, Dataset, Expense, PriceEntry } from '../domain/types'

const DATASET: Dataset = {
  version: 1,
  updatedAt: '2026-08-19T09:00:00.000Z',
  expenses: [
    {
      id: 'a',
      date: '2026-08-01',
      title: 'Veterinario',
      amount: 90,
      shares: { me: 45, partner: 45 },
      paidBy: 'me',
      tricount: 'condivise',
      category: 'gatto',
      recurring: false,
    },
  ],
  tricounts: [],
  settlements: [],
  prices: [],
}

/** Un'annotazione, che è il caso storico e resta il più frequente. */
const patch = (fields: Record<string, unknown>, ts = 1): OutboxEntry =>
  ({ kind: 'patch', entryId: `e${ts}`, expenseId: 'a', ts, ...fields }) as OutboxEntry

const NUOVA: Expense = {
  id: 'b',
  date: '2026-08-20',
  title: 'Spesa Esselunga',
  amount: 47.3,
  shares: { me: 23.65, partner: 23.65 },
  paidBy: 'me',
  tricount: 'condivise',
  category: 'spesa',
  recurring: false,
}

describe('annotazioni', () => {
  it('applica tag, nota e scontrini', () => {
    const next = applyOps(DATASET, [
      patch({ tax730: true, notes: 'Ricevuta chiesta', receiptLinks: ['https://drive.google.com/x'] }),
    ])
    expect(next.expenses[0]?.tax730).toBe(true)
    expect(next.expenses[0]?.notes).toBe('Ricevuta chiesta')
    expect(next.expenses[0]?.receiptLinks).toEqual(['https://drive.google.com/x'])
  })

  it('non modifica il dataset originale', () => {
    applyOps(DATASET, [patch({ tax730: true })])
    expect(DATASET.expenses[0]?.tax730).toBeUndefined()
  })

  it('applica in ordine cronologico, non di inserimento', () => {
    const next = applyOps(DATASET, [patch({ notes: 'seconda' }, 20), patch({ notes: 'prima' }, 10)])
    expect(next.expenses[0]?.notes).toBe('seconda')
  })

  it('toglie i campi svuotati invece di lasciarli vuoti nel file', () => {
    const tagged = applyOps(DATASET, [patch({ tax730: true, notes: 'x' })])
    const cleared = applyOps(tagged, [patch({ tax730: false, notes: '  ' }, 2)])
    expect(cleared.expenses[0]).not.toHaveProperty('tax730')
    expect(cleared.expenses[0]).not.toHaveProperty('notes')
  })

  it('ignora le annotazioni su spese che non esistono', () => {
    const next = applyOps(DATASET, [patch({ expenseId: 'inesistente', tax730: true })])
    expect(next.expenses[0]?.tax730).toBeUndefined()
  })
})

describe('creare, correggere, eliminare', () => {
  const crea = (ts = 1): OutboxEntry => ({ kind: 'create', expense: NUOVA, entryId: `c${ts}`, ts })

  it('aggiunge una spesa nuova', () => {
    const next = applyOps(DATASET, [crea()])
    expect(next.expenses).toHaveLength(2)
    expect(next.expenses[1]?.title).toBe('Spesa Esselunga')
    expect(DATASET.expenses).toHaveLength(1)
  })

  it('non aggiunge due volte la stessa spesa', () => {
    /* Succede davvero: il commit è andato a buon fine ma Pages serve ancora il
       file vecchio, quindi la voce resta in coda e viene riapplicata. */
    const next = applyOps(applyOps(DATASET, [crea()]), [crea(2)])
    expect(next.expenses).toHaveLength(2)
  })

  it('corregge i campi di una spesa esistente', () => {
    const next = applyOps(DATASET, [
      { kind: 'update', expenseId: 'a', fields: { amount: 100, shares: { me: 50, partner: 50 } }, entryId: 'u', ts: 1 },
    ])
    expect(next.expenses[0]?.amount).toBe(100)
    expect(next.expenses[0]?.shares).toEqual({ me: 50, partner: 50 })
  })

  it('una correzione spegne i flag portando false, non omettendoli', () => {
    /* È il contratto su cui poggia il modulo di inserimento: le due spunte
       (730 e welfare) viaggiano **sempre** come booleani, perché un campo
       assente in un `update` vuol dire «lascia com'era» e togliere la spunta
       non farebbe niente. A spegnerli è `normalize`, che cancella la chiave
       quando il valore è falso: il file non si riempie di `false`. */
    const acceso = applyOps(DATASET, [patch({ tax730: true, welfare: true })])
    expect(acceso.expenses[0]?.tax730).toBe(true)
    expect(acceso.expenses[0]?.welfare).toBe(true)

    const spento = applyOps(acceso, [
      {
        kind: 'update',
        expenseId: 'a',
        fields: { ...(acceso.expenses[0] as Expense), tax730: false, welfare: false },
        entryId: 'u',
        ts: 2,
      },
    ])
    expect(spento.expenses[0]).not.toHaveProperty('tax730')
    expect(spento.expenses[0]).not.toHaveProperty('welfare')

    /* E l'operazione si riconosce come applicata, altrimenti resterebbe in coda
       per sempre: il confronto è con l'intenzione normalizzata, quindi «flag a
       false» è soddisfatto da una spesa che non ha più quella chiave. */
    const spegni: OutboxEntry = {
      kind: 'update',
      expenseId: 'a',
      fields: { tax730: false, welfare: false },
      entryId: 'u2',
      ts: 3,
    }
    expect(isAlreadyApplied(spento, undefined, spegni)).toBe(true)
    expect(isAlreadyApplied(acceso, undefined, spegni)).toBe(false)
  })

  it('elimina una spesa', () => {
    const next = applyOps(DATASET, [{ kind: 'delete', expenseId: 'a', entryId: 'd', ts: 1 }])
    expect(next.expenses).toHaveLength(0)
  })

  it('creare e poi eliminare lascia il dataset come prima', () => {
    const next = applyOps(DATASET, [
      crea(1),
      { kind: 'delete', expenseId: 'b', entryId: 'd', ts: 2 },
    ])
    expect(next.expenses.map((e) => e.id)).toEqual(['a'])
  })

  it('dopo un\'eliminazione le operazioni successive colpiscono ancora la spesa giusta', () => {
    /* L'eliminazione sposta gli indici: se la mappa id→posizione non si rifà,
       la nota finisce sulla spesa sbagliata. */
    const due = applyOps(DATASET, [crea(1)])
    const next = applyOps(due, [
      { kind: 'delete', expenseId: 'a', entryId: 'd', ts: 2 },
      { kind: 'patch', expenseId: 'b', notes: 'sulla seconda', entryId: 'p', ts: 3 },
    ])
    expect(next.expenses).toHaveLength(1)
    expect(next.expenses[0]?.id).toBe('b')
    expect(next.expenses[0]?.notes).toBe('sulla seconda')
  })

  it('aggiunge un tricount, una volta sola', () => {
    const viaggio = {
      kind: 'tricount' as const,
      tricount: {
        id: 'sicilia-2026',
        name: 'Sicilia',
        members: ['me', 'partner'] as ('me' | 'partner')[],
        trip: { place: 'Palermo', year: 2026, start: '2026-09-12', end: '2026-09-20' },
      },
      entryId: 't',
      ts: 1,
    }
    const next = applyOps(applyOps(DATASET, [viaggio]), [{ ...viaggio, entryId: 't2', ts: 2 }])
    expect(next.tricounts).toHaveLength(1)
  })
})

describe('coda già pubblicata', () => {
  it('riconosce quando il dato scaricato contiene già l’annotazione', () => {
    const applied = applyOps(DATASET, [patch({ tax730: true })])
    expect(isAlreadyApplied(applied, undefined, patch({ tax730: true }))).toBe(true)
    expect(isAlreadyApplied(DATASET, undefined, patch({ tax730: true }))).toBe(false)
  })

  it('riconosce una creazione già pubblicata, e un\'eliminazione già avvenuta', () => {
    const crea: OutboxEntry = { kind: 'create', expense: NUOVA, entryId: 'c', ts: 1 }
    const elimina: OutboxEntry = { kind: 'delete', expenseId: 'a', entryId: 'd', ts: 1 }
    expect(isAlreadyApplied(DATASET, undefined, crea)).toBe(false)
    expect(isAlreadyApplied(applyOps(DATASET, [crea]), undefined, crea)).toBe(true)
    expect(isAlreadyApplied(DATASET, undefined, elimina)).toBe(false)
    expect(isAlreadyApplied(applyOps(DATASET, [elimina]), undefined, elimina)).toBe(true)
  })

  it('scarta dalla coda le voci già pubblicate', () => {
    const applied = applyOps(DATASET, [patch({ tax730: true })])
    const state = { pending: [], settled: [patch({ tax730: true }), patch({ notes: 'altro' }, 2)] }
    // `now` vicino ai timestamp delle voci: nessuna è ancora scaduta per tempo
    const pruned = pruneSettled(state, applied, undefined, 1000)
    expect(pruned.settled.map((e) => e.entryId)).toEqual(['e2'])
  })

  it('dimentica le voci troppo vecchie per essere ancora in volo', () => {
    const old = patch({ notes: 'vecchia' }, 1)
    const pruned = pruneSettled({ pending: [], settled: [old] }, DATASET, undefined, 40 * 24 * 60 * 60 * 1000)
    expect(pruned.settled).toHaveLength(0)
  })
})

describe('messaggio di commit', () => {
  it('dice cosa è cambiato, al plurale giusto', () => {
    expect(describeOps([patch({ tax730: true })])).toBe('1 annotazione')
    expect(
      describeOps([
        { kind: 'create', expense: NUOVA, entryId: 'c1', ts: 1 },
        { kind: 'create', expense: { ...NUOVA, id: 'c' }, entryId: 'c2', ts: 2 },
        { kind: 'delete', expenseId: 'a', entryId: 'd', ts: 3 },
      ]),
    ).toBe('2 spese aggiunte, 1 spesa eliminata')
  })

  it('nomina anche le rilevazioni di prezzo', () => {
    expect(
      describeOps([
        { kind: 'price', entry: RILEVAZIONE, entryId: 'p1', ts: 1 },
        { kind: 'price', entry: { ...RILEVAZIONE, id: 'prezzo-2' }, entryId: 'p2', ts: 2 },
        { kind: 'price-delete', priceId: 'prezzo-3', entryId: 'p3', ts: 3 },
      ]),
    ).toBe('2 prezzi rilevati, 1 rilevazione eliminata')
  })
})

// ─────────────────────── le rilevazioni di prezzo ───────────────────────

const RILEVAZIONE: PriceEntry = {
  id: 'prezzo-2026-08-21-a1b2c3',
  product: 'Passata di pomodoro',
  store: 'Esselunga',
  unit: 'kg',
  price: 2.15,
  date: '2026-08-21',
}

describe('rilevazioni di prezzo', () => {
  const rileva = (entry: PriceEntry, ts = 1): OutboxEntry => ({
    kind: 'price',
    entry,
    entryId: `p${ts}`,
    ts,
  })

  it('aggiunge una rilevazione, una volta sola', () => {
    const next = applyOps(DATASET, [rileva(RILEVAZIONE), rileva(RILEVAZIONE, 2)])
    expect(next.prices).toHaveLength(1)
    expect(next.prices[0]?.price).toBe(2.15)
  })

  it('non tocca le spese: una rilevazione non è un acquisto', () => {
    const next = applyOps(DATASET, [rileva(RILEVAZIONE)])
    expect(next.expenses).toBe(DATASET.expenses)
    expect(next.settlements).toBe(DATASET.settlements)
  })

  it('ripulisce gli spazi e non salva una nota vuota', () => {
    const next = applyOps(DATASET, [
      rileva({ ...RILEVAZIONE, product: '  Passata  ', store: ' Lidl ', note: '   ' }),
    ])
    expect(next.prices[0]?.product).toBe('Passata')
    expect(next.prices[0]?.store).toBe('Lidl')
    expect(next.prices[0]).not.toHaveProperty('note')
  })

  it('elimina per id, e non inventa niente se quell’id non c’è', () => {
    const con = applyOps(DATASET, [rileva(RILEVAZIONE)])
    const senza = applyOps(con, [{ kind: 'price-delete', priceId: RILEVAZIONE.id, entryId: 'd', ts: 2 }])
    expect(senza.prices).toEqual([])
    expect(applyOps(DATASET, [{ kind: 'price-delete', priceId: 'ignoto', entryId: 'd', ts: 2 }])).toBe(
      DATASET,
    )
  })

  /* L'invariante di CLAUDE.md: un'operazione non riconosciuta resta in coda per
     sempre, e il contatore delle modifiche in attesa non torna più a zero. */
  it('una volta pubblicata non resta in coda per sempre', () => {
    const aggiunta = rileva(RILEVAZIONE)
    const cancellazione: OutboxEntry = {
      kind: 'price-delete',
      priceId: RILEVAZIONE.id,
      entryId: 'd',
      ts: 2,
    }
    const con = applyOps(DATASET, [aggiunta])

    expect(isAlreadyApplied(DATASET, undefined, aggiunta)).toBe(false)
    expect(isAlreadyApplied(con, undefined, aggiunta)).toBe(true)
    expect(isAlreadyApplied(con, undefined, cancellazione)).toBe(false)
    expect(isAlreadyApplied(DATASET, undefined, cancellazione)).toBe(true)
  })

  it('sopravvive al giro in localStorage', () => {
    const round = JSON.parse(JSON.stringify(rileva(RILEVAZIONE))) as OutboxEntry
    expect(round).toEqual(rileva(RILEVAZIONE))
    expect(applyOps(DATASET, [round]).prices).toHaveLength(1)
  })

  it('non riscrive la configurazione', () => {
    expect(touchesConfig({ kind: 'price', entry: RILEVAZIONE })).toBe(false)
    expect(touchesConfig({ kind: 'price-delete', priceId: RILEVAZIONE.id })).toBe(false)
  })

  /* I file cifrati scritti prima di ADR-0041 non hanno il campo: la coda non
     deve inciampare su un dataset che arriva senza. */
  it('regge un dataset senza il campo, come quelli scritti prima', () => {
    const { prices: _drop, ...senzaCampo } = DATASET
    const next = applyOps(senzaCampo as Dataset, [rileva(RILEVAZIONE)])
    expect(next.prices).toHaveLength(1)
  })
})

// ─────────────────── spostare una spesa fuori da una vacanza ───────────────────

const IN_VACANZA: Expense = {
  id: 'v',
  date: '2026-07-18',
  title: 'Ombrellone',
  amount: 30,
  shares: { me: 15, partner: 15 },
  paidBy: 'me',
  tricount: 'sud-italia-2026',
  category: 'viaggi',
  subcategory: 'attivita',
  recurring: false,
}

const CON_VACANZA: Dataset = { ...DATASET, expenses: [...DATASET.expenses, IN_VACANZA] }

describe('togliere un campo con un update', () => {
  /*
   * Con il modello a tricount lo spostamento è un campo solo che si riscrive:
   * la danza «source più trip, e trip si svuota con la stringa vuota» non
   * esiste più per il viaggio. Resta per la sottocategoria, ed è lei che questo
   * blocco presidia: la coda vive in localStorage e `JSON.stringify` butta via
   * le chiavi `undefined`, quindi «togli» si dice con la stringa vuota.
   */
  const uscita: OutboxEntry = {
    kind: 'update',
    expenseId: 'v',
    fields: { tricount: 'condivise', category: 'spesa', subcategory: '' },
    entryId: 'u',
    ts: 1,
  }

  it('la spesa esce dalla vacanza e non si porta dietro il dettaglio', () => {
    const next = applyOps(CON_VACANZA, [uscita])
    const moved = next.expenses.find((e) => e.id === 'v')
    expect(moved?.tricount).toBe('condivise')
    expect(moved).not.toHaveProperty('subcategory')
  })

  it('e sopravvive al giro in localStorage, che è dove si perdeva', () => {
    const round = JSON.parse(JSON.stringify(uscita)) as OutboxEntry
    expect(round).toEqual(uscita)
    const moved = applyOps(CON_VACANZA, [round]).expenses.find((e) => e.id === 'v')
    expect(moved).not.toHaveProperty('subcategory')
  })

  it('e una volta applicata non resta in coda per sempre', () => {
    const applied = applyOps(CON_VACANZA, [uscita])
    expect(isAlreadyApplied(applied, undefined, uscita)).toBe(true)
    expect(isAlreadyApplied(CON_VACANZA, undefined, uscita)).toBe(false)
  })
})

describe('il flag «concluso» di un tricount', () => {
  const VIAGGI: Dataset = {
    ...DATASET,
    tricounts: [
      {
        id: 'creta-2025',
        name: 'Creta',
        members: ['me', 'partner'],
        trip: { place: 'Creta', year: 2025, start: '2025-08-17', end: '2025-08-25' },
      },
    ],
  }
  const chiudi: OutboxEntry = {
    kind: 'tricount-edit',
    tricountId: 'creta-2025',
    fields: { closed: true },
    entryId: 'te',
    ts: 1,
  }

  it('si applica al tricount che esiste', () => {
    expect(applyOps(VIAGGI, [chiudi]).tricounts[0]?.closed).toBe(true)
  })

  it('su un tricount che non c’è non fa niente, invece di inventarlo', () => {
    const altro: OutboxEntry = { ...chiudi, tricountId: 'mai-esistito', entryId: 'x' }
    expect(applyOps(VIAGGI, [altro]).tricounts).toEqual(VIAGGI.tricounts)
  })

  /* Senza questo, l'operazione resterebbe in coda a vita: «tricount» guarda solo
     se l'id esiste, e per una modifica l'id esiste già sempre. */
  it('e si riconosce come già pubblicata, cosa che «tricount» non saprebbe fare', () => {
    expect(isAlreadyApplied(VIAGGI, undefined, chiudi)).toBe(false)
    expect(isAlreadyApplied(applyOps(VIAGGI, [chiudi]), undefined, chiudi)).toBe(true)
  })

  it('riaprire un tricount non lascia «closed: false» nei dati', () => {
    const chiuso = applyOps(VIAGGI, [chiudi])
    const riapri: OutboxEntry = { ...chiudi, fields: { closed: false }, entryId: 'r', ts: 2 }
    expect(applyOps(chiuso, [riapri]).tricounts[0]).not.toHaveProperty('closed')
  })
})

describe('spostare le spese di una categoria', () => {
  const sposta: OutboxEntry = { kind: 'recategorize', from: 'viaggi', to: 'altro', entryId: 'rc', ts: 1 }

  it('cambia categoria a tutte, e non tocca le altre', () => {
    const next = applyOps(CON_VACANZA, [sposta])
    expect(next.expenses.find((e) => e.id === 'v')?.category).toBe('altro')
    expect(next.expenses.find((e) => e.id === 'a')?.category).toBe('gatto')
  })

  /* La sottocategoria appartiene alla categoria di partenza: portarsela dietro
     lascerebbe `altro/attivita`, che non esiste, e l'interfaccia mostrerebbe
     l'id grezzo al posto di un'etichetta. */
  it('e non porta con sé una sottocategoria che nella nuova non esiste', () => {
    const moved = applyOps(CON_VACANZA, [sposta]).expenses.find((e) => e.id === 'v')
    expect(moved).not.toHaveProperty('subcategory')
  })

  it('a categoria già vuota è un’operazione già applicata', () => {
    expect(isAlreadyApplied(CON_VACANZA, undefined, sposta)).toBe(false)
    expect(isAlreadyApplied(applyOps(CON_VACANZA, [sposta]), undefined, sposta)).toBe(true)
  })
})

// ─────────────────── le operazioni che toccano la configurazione ───────────────────

const CONFIG: AppConfig = {
  version: 1,
  people: { me: { name: 'A', emoji: '🧔' }, partner: { name: 'F', emoji: '👩' } },
  income: {
    me: {
      configured: true,
      netMonthly: 2000,
      extraMonths: 1,
      annualBonusNet: 0,
      mealVouchers: { valuePerDay: 0, daysPerMonth: 0 },
      otherMonthlyNet: 0,
      monthlySavingsTarget: 250,
    },
    partner: null,
  },
  categories: [{ id: 'casa', label: 'Casa', slot: 0 }],
  catCategory: 'gatto',
  tripCategory: 'viaggi',
  houseTricount: 'fisse',
  houseCategory: 'casa',
  balance: { since: '2026-08-16', opening: 0 },
  fiscal: { deductibleHints: [], driveFolderHint: '' },
  github: null,
}

describe('categorie ed entrate', () => {
  const categorie: OutboxEntry = {
    kind: 'categories',
    categories: [
      { id: 'casa', label: 'Casa', slot: 0 },
      { id: 'nuova', label: 'Nuova' },
    ],
    entryId: 'c1',
    ts: 1,
  }

  it('sostituiscono l’elenco per intero', () => {
    const next = applyConfigOps(CONFIG, [categorie])
    expect(next.categories.map((c) => c.id)).toEqual(['casa', 'nuova'])
  })

  it('e riapplicarle due volte dà lo stesso risultato', () => {
    const una = applyConfigOps(CONFIG, [categorie])
    const due = applyConfigOps(una, [{ ...categorie, entryId: 'c2', ts: 2 }])
    expect(due.categories).toEqual(una.categories)
  })

  it('le entrate cambiano una persona alla volta', () => {
    const profilo = { ...CONFIG.income.me, netMonthly: 1750, monthlySavingsTarget: 150 }
    const next = applyConfigOps(CONFIG, [
      { kind: 'income', person: 'partner', profile: profilo, entryId: 'i', ts: 1 },
    ])
    expect(next.income.partner?.netMonthly).toBe(1750)
    expect(next.income.me.netMonthly).toBe(2000)
  })

  /*
   * Senza la configurazione non si può sapere se un'operazione è già arrivata, e
   * la risposta giusta è «non ancora»: una voce di troppo si riapplica senza
   * danno, una buttata via è perduta.
   */
  it('senza configurazione si dice «non ancora», non «sì»', () => {
    expect(isAlreadyApplied(DATASET, undefined, categorie)).toBe(false)
  })

  it('con la configurazione si riconoscono, e non restano in coda a vita', () => {
    const applied = applyConfigOps(CONFIG, [categorie])
    expect(isAlreadyApplied(DATASET, CONFIG, categorie)).toBe(false)
    expect(isAlreadyApplied(DATASET, applied, categorie)).toBe(true)
  })

  it('e solo loro riscrivono la configurazione', () => {
    expect(touchesConfig(categorie)).toBe(true)
    expect(touchesConfig({ kind: 'delete', expenseId: 'a' })).toBe(false)
    expect(touchesConfig({ kind: 'recategorize', from: 'a', to: 'b' })).toBe(false)
  })
})
