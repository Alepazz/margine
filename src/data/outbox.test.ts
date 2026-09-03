import { describe, expect, it } from 'vitest'

import {
  applyCardOps,
  applyConfigOps,
  applyOps,
  applyShoppingOps,
  describeOps,
  fileOf,
  isAlreadyApplied,
  pendingTwin,
  pruneSettled,
  type OutboxEntry,
  type RemoteView,
} from './outbox'
import type {
  AppConfig,
  CardsFile,
  Dataset,
  Expense,
  LoyaltyCard,
  PriceEntry,
  ShoppingFile,
  ShoppingItem,
} from '../domain/types'

/**
 * Il termine di confronto della coda, con i file che il caso non guarda a
 * `undefined`.
 *
 * `undefined` e non una lista vuota: sono due cose diverse, e la differenza è
 * ciò che impedisce a un `card-delete` di risultare applicato prima di essere
 * partito.
 */
function remoto(dataset: Dataset, over: Partial<RemoteView> = {}): RemoteView {
  return { dataset, config: undefined, cards: undefined, shopping: undefined, ...over }
}

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
    /* È il contratto su cui poggia il modulo di inserimento: le **tre** spunte
       (730, welfare e capitale) viaggiano **sempre** come booleani, perché un
       campo assente in un `update` vuol dire «lascia com'era» e togliere la
       spunta non farebbe niente. A spegnerli è `normalize`, che cancella la
       chiave quando il valore è falso: il file non si riempie di `false`.

       `offBudget` è entrato per terzo con ADR-0079, e se questo test avesse
       continuato a nominarne due la sua metà del contratto non l'avrebbe
       presidiata nessuno: la spunta si sarebbe accesa e non più spenta, e il
       capitale sarebbe rimasto fuori dai conti per sempre. */
    const acceso = applyOps(DATASET, [patch({ tax730: true, welfare: true })])
    expect(acceso.expenses[0]?.tax730).toBe(true)
    expect(acceso.expenses[0]?.welfare).toBe(true)

    /* Il capitale non passa da `patch`: è un campo del modulo di correzione,
       non un'annotazione del foglio di dettaglio. Arriva quindi con `update`. */
    const capitale = applyOps(acceso, [
      {
        kind: 'update',
        expenseId: 'a',
        fields: { ...(acceso.expenses[0] as Expense), offBudget: true },
        entryId: 'u0',
        ts: 2,
      },
    ])
    expect(capitale.expenses[0]?.offBudget).toBe(true)

    const spento = applyOps(capitale, [
      {
        kind: 'update',
        expenseId: 'a',
        fields: {
          ...(capitale.expenses[0] as Expense),
          tax730: false,
          welfare: false,
          offBudget: false,
        },
        entryId: 'u',
        ts: 3,
      },
    ])
    expect(spento.expenses[0]).not.toHaveProperty('tax730')
    expect(spento.expenses[0]).not.toHaveProperty('welfare')
    expect(spento.expenses[0]).not.toHaveProperty('offBudget')

    /* E l'operazione si riconosce come applicata, altrimenti resterebbe in coda
       per sempre: il confronto è con l'intenzione normalizzata, quindi «flag a
       false» è soddisfatto da una spesa che non ha più quella chiave. */
    const spegni: OutboxEntry = {
      kind: 'update',
      expenseId: 'a',
      fields: { tax730: false, welfare: false, offBudget: false },
      entryId: 'u2',
      ts: 4,
    }
    expect(isAlreadyApplied(remoto(spento), spegni)).toBe(true)
    expect(isAlreadyApplied(remoto(capitale), spegni)).toBe(false)
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
    expect(isAlreadyApplied(remoto(applied), patch({ tax730: true }))).toBe(true)
    expect(isAlreadyApplied(remoto(DATASET), patch({ tax730: true }))).toBe(false)
  })

  it('riconosce una creazione già pubblicata, e un\'eliminazione già avvenuta', () => {
    const crea: OutboxEntry = { kind: 'create', expense: NUOVA, entryId: 'c', ts: 1 }
    const elimina: OutboxEntry = { kind: 'delete', expenseId: 'a', entryId: 'd', ts: 1 }
    expect(isAlreadyApplied(remoto(DATASET), crea)).toBe(false)
    expect(isAlreadyApplied(remoto(applyOps(DATASET, [crea])), crea)).toBe(true)
    expect(isAlreadyApplied(remoto(DATASET), elimina)).toBe(false)
    expect(isAlreadyApplied(remoto(applyOps(DATASET, [elimina])), elimina)).toBe(true)
  })

  it('scarta dalla coda le catene già pubblicate per intero', () => {
    const applied = applyOps(DATASET, [patch({ tax730: true }), patch({ notes: 'altro' }, 2)])
    const state = { pending: [], settled: [patch({ tax730: true }), patch({ notes: 'altro' }, 2)] }
    // `now` vicino ai timestamp delle voci: nessuna è ancora scaduta per tempo
    expect(pruneSettled(state, remoto(applied), 1000).settled).toHaveLength(0)
  })

  it('tiene la catena intera se l’ultima non è ancora arrivata', () => {
    /* Le due toccano la **stessa** spesa, quindi si potano insieme: `e1` è
       arrivata ma `e2` no, e tenere anche `e1` è innocuo (riapplicarla non
       cambia niente) mentre scartarla a metà catena è il difetto che il test
       qui sotto descrive. */
    const applied = applyOps(DATASET, [patch({ tax730: true })])
    const state = { pending: [], settled: [patch({ tax730: true }), patch({ notes: 'altro' }, 2)] }
    const pruned = pruneSettled(state, remoto(applied), 1000)
    expect(pruned.settled.map((e) => e.entryId)).toEqual(['e1', 'e2'])
  })

  /*
   * ─────────────────────────────────────────────────────────────────────────
   * Il fantasma: due operazioni committate che si annullano.
   *
   * Potate una per una, la logica si capovolge — il remoto non ha la spesa,
   * quindi il `delete` risulta applicato e viene scartato mentre il `create`
   * risulta non applicato e viene tenuto. Resta in coda il solo `create`, e
   * ogni sovrapposizione lo riapplica: la spesa cancellata torna a schermo.
   * Ricancellarla non serviva, perché la nuova `delete` veniva potata allo
   * stesso modo. → ADR-0069
   * ─────────────────────────────────────────────────────────────────────────
   */
  describe('due operazioni che si annullano', () => {
    const crea: OutboxEntry = { kind: 'create', expense: NUOVA, entryId: 'c', ts: 1 }
    const elimina: OutboxEntry = { kind: 'delete', expenseId: NUOVA.id, entryId: 'd', ts: 2 }

    it('una spesa aggiunta e cancellata non torna', () => {
      /* `DATASET` è il remoto dopo che entrambe sono state committate: la spesa
         non c'è. */
      const pruned = pruneSettled({ pending: [], settled: [crea, elimina] }, remoto(DATASET), 1000)
      expect(pruned.settled).toHaveLength(0)
      expect(applyOps(DATASET, pruned.settled).expenses.map((e) => e.id)).not.toContain(NUOVA.id)
    })

    it('e non torna nemmeno al giro dopo', () => {
      /* Il difetto vero era qui: ricancellarla produceva un commit a vuoto, la
         nuova `delete` veniva potata come «già applicata» e il `create` restava. */
      const primo = pruneSettled({ pending: [], settled: [crea, elimina] }, remoto(DATASET), 1000)
      const ancora: OutboxEntry = { kind: 'delete', expenseId: NUOVA.id, entryId: 'd2', ts: 3 }
      const secondo = pruneSettled(
        { pending: [], settled: [...primo.settled, ancora] },
        remoto(DATASET),
        1000,
      )
      expect(applyOps(DATASET, secondo.settled).expenses.map((e) => e.id)).not.toContain(NUOVA.id)
    })

    it('un rimborso registrato e annullato non sposta il saldo mostrato', () => {
      const rimborso = { id: 'r1', date: '2026-08-28', from: 'partner' as const, to: 'me' as const, amount: 40 }
      const registra: OutboxEntry = { kind: 'settle', settlement: rimborso, entryId: 's', ts: 1 }
      const annulla: OutboxEntry = { kind: 'unsettle', settlementId: 'r1', entryId: 'u', ts: 2 }
      const pruned = pruneSettled({ pending: [], settled: [registra, annulla] }, remoto(DATASET), 1000)
      expect(applyOps(DATASET, pruned.settled).settlements ?? []).toHaveLength(0)
    })

    it('una spunta accesa e spenta resta spenta', () => {
      const accendi = patch({ tax730: true })
      const spegni = patch({ tax730: false }, 2)
      /* Il remoto con entrambe applicate: `normalize` cancella il flag falso. */
      const pubblicato = applyOps(DATASET, [accendi, spegni])
      const pruned = pruneSettled(
        { pending: [], settled: [accendi, spegni] },
        remoto(pubblicato),
        1000,
      )
      expect(applyOps(pubblicato, pruned.settled).expenses[0]).not.toHaveProperty('tax730')
    })

    it('un importo corretto due volte mostra la correzione buona', () => {
      const dieci: OutboxEntry = { kind: 'update', expenseId: 'a', fields: { amount: 10, shares: { me: 5, partner: 5 } }, entryId: 'u1', ts: 1 }
      const dodici: OutboxEntry = { kind: 'update', expenseId: 'a', fields: { amount: 12, shares: { me: 6, partner: 6 } }, entryId: 'u2', ts: 2 }
      const pubblicato = applyOps(DATASET, [dieci, dodici])
      const pruned = pruneSettled(
        { pending: [], settled: [dieci, dodici] },
        remoto(pubblicato),
        1000,
      )
      expect(applyOps(pubblicato, pruned.settled).expenses[0]?.amount).toBe(12)
    })
  })

  it('dimentica le voci troppo vecchie per essere ancora in volo', () => {
    const old = patch({ notes: 'vecchia' }, 1)
    const pruned = pruneSettled({ pending: [], settled: [old] }, remoto(DATASET), 40 * 24 * 60 * 60 * 1000)
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

    expect(isAlreadyApplied(remoto(DATASET), aggiunta)).toBe(false)
    expect(isAlreadyApplied(remoto(con), aggiunta)).toBe(true)
    expect(isAlreadyApplied(remoto(con), cancellazione)).toBe(false)
    expect(isAlreadyApplied(remoto(DATASET), cancellazione)).toBe(true)
  })

  it('sopravvive al giro in localStorage', () => {
    const round = JSON.parse(JSON.stringify(rileva(RILEVAZIONE))) as OutboxEntry
    expect(round).toEqual(rileva(RILEVAZIONE))
    expect(applyOps(DATASET, [round]).prices).toHaveLength(1)
  })

  it('non riscrive la configurazione', () => {
    expect(fileOf({ kind: 'price', entry: RILEVAZIONE })).toBe('data')
    expect(fileOf({ kind: 'price-delete', priceId: RILEVAZIONE.id })).toBe('data')
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
    expect(isAlreadyApplied(remoto(applied), uscita)).toBe(true)
    expect(isAlreadyApplied(remoto(CON_VACANZA), uscita)).toBe(false)
  })
})

describe('il flag «concluso» di un tricount', () => {
  const VIAGGI: Dataset = {
    ...DATASET,
    tricounts: [
      {
        id: 'vacanza-2025',
        name: 'Vacanza',
        members: ['me', 'partner'],
        trip: { place: 'Vacanza', year: 2025, start: '2025-08-17', end: '2025-08-25' },
      },
    ],
  }
  const chiudi: OutboxEntry = {
    kind: 'tricount-edit',
    tricountId: 'vacanza-2025',
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
    expect(isAlreadyApplied(remoto(VIAGGI), chiudi)).toBe(false)
    expect(isAlreadyApplied(remoto(applyOps(VIAGGI, [chiudi])), chiudi)).toBe(true)
  })

  it('riaprire un tricount non lascia «closed: false» nei dati', () => {
    const chiuso = applyOps(VIAGGI, [chiudi])
    const riapri: OutboxEntry = { ...chiudi, fields: { closed: false }, entryId: 'r', ts: 2 }
    expect(applyOps(chiuso, [riapri]).tricounts[0]).not.toHaveProperty('closed')
  })

  it('e «riapri» si riconosce come pubblicata, invece di restare in coda due settimane', () => {
    /* `applyOps` passa da `normalizeTricount`, che cancella `closed` quando è
       falso. Confrontato **grezzo**, `{ closed: false }` non era mai riconosciuto
       come applicato — `JSON.stringify(undefined) !== 'false'` — quindi restava
       fra le `settled` per quattordici giorni, riapplicandosi a ogni caricamento.
       È lo stesso difetto che `update` aveva già risolto confrontando con
       l'intenzione normalizzata. → ADR-0069 */
    const riapri: OutboxEntry = { ...chiudi, fields: { closed: false }, entryId: 'r2', ts: 2 }
    const riaperto = applyOps(applyOps(VIAGGI, [chiudi]), [riapri])
    expect(isAlreadyApplied(remoto(riaperto), riapri)).toBe(true)
    expect(
      pruneSettled({ pending: [], settled: [riapri] }, remoto(riaperto), 1000).settled,
    ).toHaveLength(0)
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
    expect(isAlreadyApplied(remoto(CON_VACANZA), sposta)).toBe(false)
    expect(isAlreadyApplied(remoto(applyOps(CON_VACANZA, [sposta])), sposta)).toBe(true)
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
    expect(isAlreadyApplied(remoto(DATASET), categorie)).toBe(false)
  })

  it('con la configurazione si riconoscono, e non restano in coda a vita', () => {
    const applied = applyConfigOps(CONFIG, [categorie])
    expect(isAlreadyApplied(remoto(DATASET, { config: CONFIG }), categorie)).toBe(false)
    expect(isAlreadyApplied(remoto(DATASET, { config: applied }), categorie)).toBe(true)
  })

  it('e solo loro riscrivono la configurazione', () => {
    expect(fileOf(categorie)).toBe('config')
    expect(fileOf({ kind: 'delete', expenseId: 'a' })).toBe('data')
    expect(fileOf({ kind: 'recategorize', from: 'a', to: 'b' })).toBe('data')
  })
})

// ─────────────────────────── le carte fedeltà ───────────────────────────

const CARTA: LoyaltyCard = {
  id: 'carta-2026-09-02-a1b2c3d4',
  name: 'Supermercato A',
  code: '0999888777664',
  format: 'ean13',
  addedAt: '2026-09-02',
  note: 'Numero cliente 4471',
}

const CARTE: CardsFile = { version: 1, updatedAt: '2026-09-02T09:00:00.000Z', cards: [] }

function aggiungi(card: LoyaltyCard, ts = 1): OutboxEntry {
  return { kind: 'card', card, entryId: `c${String(ts)}`, ts }
}

describe('le carte fedeltà', () => {
  it('vanno nel loro file, non fra le spese né nella configurazione', () => {
    /* Un'operazione col bersaglio sbagliato non dà errore: viene applicata a un
       file che non la riguarda, non trova niente da fare, e resta in coda per
       sempre. → ADR-0082 */
    expect(fileOf({ kind: 'card', card: CARTA })).toBe('cards')
    expect(fileOf({ kind: 'card-edit', cardId: CARTA.id, fields: {} })).toBe('cards')
    expect(fileOf({ kind: 'card-delete', cardId: CARTA.id })).toBe('cards')
  })

  it('si aggiunge, e due volte la stessa non fa due carte', () => {
    const next = applyCardOps(CARTE, [aggiungi(CARTA), aggiungi(CARTA, 2)])
    expect(next.cards).toHaveLength(1)
    expect(next.cards[0]?.name).toBe('Supermercato A')
  })

  it('non tocca il file quando non c’è niente da fare', () => {
    /* Stessa identità dell'oggetto: è ciò che evita di riscrivere un envelope
       (con un IV nuovo) per un'operazione che non cambia niente. */
    expect(applyCardOps(CARTE, [{ kind: 'card-delete', cardId: 'ignoto', entryId: 'x', ts: 1 }])).toBe(
      CARTE,
    )
  })

  it('si corregge, e un campo si cancella con la stringa vuota', () => {
    const con = applyCardOps(CARTE, [aggiungi(CARTA)])
    const senzaNota = applyCardOps(con, [
      { kind: 'card-edit', cardId: CARTA.id, fields: { note: '' }, entryId: 'e1', ts: 2 },
    ])
    expect(senzaNota.cards[0]).not.toHaveProperty('note')
  })

  it('alza le minuscole di un Code 39, perché il lettore le alzerebbe comunque', () => {
    /* Conservandole, il numero a schermo direbbe una cosa e la cassa ne
       leggerebbe un'altra: sbagliato invece che assente. → ADR-0083 */
    const next = applyCardOps(CARTE, [aggiungi({ ...CARTA, code: 'fd44 71', format: 'code39' })])
    expect(next.cards[0]?.code).toBe('FD44 71')
  })

  it('non tocca le minuscole di un Code 128, che le sa scrivere', () => {
    const next = applyCardOps(CARTE, [aggiungi({ ...CARTA, code: 'ab-12', format: 'code128' })])
    expect(next.cards[0]?.code).toBe('ab-12')
  })

  it('ripulisce gli spazi del nome e del codice', () => {
    /* Uno spazio in coda al codice lo renderebbe non disegnabile, e il perché
       non si vedrebbe guardando il campo. */
    const next = applyCardOps(CARTE, [
      aggiungi({ ...CARTA, name: '  Supermercato A ', code: ' 0999888777664 ' }),
    ])
    expect(next.cards[0]?.name).toBe('Supermercato A')
    expect(next.cards[0]?.code).toBe('0999888777664')
  })

  it('sopravvive al giro in localStorage, immagine compresa', () => {
    const conFaccia = aggiungi({ ...CARTA, image: 'data:image/png;base64,iVBORw0KGgo=' })
    const round = JSON.parse(JSON.stringify(conFaccia)) as OutboxEntry
    expect(round).toEqual(conFaccia)
    expect(applyCardOps(CARTE, [round]).cards[0]?.image).toBe('data:image/png;base64,iVBORw0KGgo=')
  })

  it('senza il file delle carte si dice «non ancora», non «sì»', () => {
    /* `undefined` non è una lista vuota: prima che il file esista, un
       `card-delete` risulterebbe applicato e uscirebbe dalla coda senza essere
       mai partito. */
    expect(isAlreadyApplied(remoto(DATASET), aggiungi(CARTA))).toBe(false)
    expect(
      isAlreadyApplied(remoto(DATASET), { kind: 'card-delete', cardId: CARTA.id, entryId: 'd', ts: 1 }),
    ).toBe(false)
  })

  it('una volta pubblicata non resta in coda per sempre', () => {
    const con = applyCardOps(CARTE, [aggiungi(CARTA)])
    expect(isAlreadyApplied(remoto(DATASET, { cards: con.cards }), aggiungi(CARTA))).toBe(true)
    expect(isAlreadyApplied(remoto(DATASET, { cards: [] }), aggiungi(CARTA))).toBe(false)
  })

  it('una correzione si riconosce confrontando l’intenzione normalizzata', () => {
    /* Grezzo, `note: ''` non coinciderebbe mai con una carta che la nota non ce
       l'ha più, e quella voce resterebbe in coda quattordici giorni
       riapplicandosi a ogni caricamento. */
    const con = applyCardOps(CARTE, [aggiungi(CARTA)])
    const togli: OutboxEntry = {
      kind: 'card-edit',
      cardId: CARTA.id,
      fields: { note: '' },
      entryId: 'e1',
      ts: 2,
    }
    const senza = applyCardOps(con, [togli])
    expect(isAlreadyApplied(remoto(DATASET, { cards: con.cards }), togli)).toBe(false)
    expect(isAlreadyApplied(remoto(DATASET, { cards: senza.cards }), togli)).toBe(true)
  })

  it('aggiunta e cancellata, la carta non torna a schermo', () => {
    /*
     * Il fantasma di ADR-0069, su un tipo nuovo. Potate una per una, le due
     * operazioni si annullano male: il remoto non ha la carta, quindi il
     * `delete` risulta applicato e viene scartato mentre il `card` risulta non
     * applicato e viene tenuto — e ogni caricamento riapplica l'aggiunta.
     */
    const crea = aggiungi(CARTA)
    const elimina: OutboxEntry = { kind: 'card-delete', cardId: CARTA.id, entryId: 'd', ts: 2 }
    const pruned = pruneSettled(
      { pending: [], settled: [crea, elimina] },
      remoto(DATASET, { cards: [] }),
      1000,
    )
    expect(applyCardOps(CARTE, pruned.settled).cards).toEqual([])
  })
})

// ───────────────────────── la lista della spesa ─────────────────────────

const VOCE: ShoppingItem = {
  id: 'lista-2026-09-03-a1b2c3d4',
  title: 'Latte',
  qty: 1,
  unit: 'l',
  wantedAt: '2026-09-03T10:00:00.000Z',
}

const LISTA: ShoppingFile = { version: 1, updatedAt: '2026-09-03T09:00:00.000Z', items: [] }

function metti(item: ShoppingItem, ts = 1): OutboxEntry {
  return { kind: 'list-add', item, entryId: `l${String(ts)}`, ts }
}

function prendi(itemId: string, at: string, ts = 2): OutboxEntry {
  return { kind: 'list-take', itemId, at, entryId: `p${String(ts)}`, ts }
}

function rimetti(itemId: string, at: string, ts = 3): OutboxEntry {
  return { kind: 'list-untake', itemId, at, entryId: `r${String(ts)}`, ts }
}

describe('la lista della spesa', () => {
  it('va nel suo file, non fra le spese né nelle carte', () => {
    /* Il bersaglio sbagliato non dà errore: l'operazione viene applicata a un
       file che non la riguarda, non trova niente da fare, e resta in coda per
       sempre. → ADR-0088 */
    expect(fileOf({ kind: 'list-add', item: VOCE })).toBe('shopping')
    expect(fileOf({ kind: 'list-edit', itemId: VOCE.id, fields: {} })).toBe('shopping')
    expect(fileOf({ kind: 'list-take', itemId: VOCE.id, at: VOCE.wantedAt })).toBe('shopping')
    expect(fileOf({ kind: 'list-untake', itemId: VOCE.id, at: VOCE.wantedAt })).toBe('shopping')
    expect(fileOf({ kind: 'list-delete', itemId: VOCE.id })).toBe('shopping')
  })

  it('si aggiunge, e due volte la stessa non fa due voci', () => {
    const next = applyShoppingOps(LISTA, [metti(VOCE), metti(VOCE, 2)])
    expect(next.items).toHaveLength(1)
    expect(next.items[0]?.title).toBe('Latte')
  })

  it('non tocca il file quando non c’è niente da fare', () => {
    /* Stessa identità dell'oggetto: è ciò che evita di riscrivere un envelope
       (con un IV nuovo) per un'operazione che non cambia niente. */
    expect(
      applyShoppingOps(LISTA, [{ kind: 'list-delete', itemId: 'ignoto', entryId: 'x', ts: 1 }]),
    ).toBe(LISTA)
  })

  it('presa, la voce porta l’istante dell’operazione', () => {
    const con = applyShoppingOps(LISTA, [metti(VOCE)])
    const next = applyShoppingOps(con, [prendi(VOCE.id, '2026-09-03T18:30:00.000Z')])
    expect(next.items[0]?.takenAt).toBe('2026-09-03T18:30:00.000Z')
  })

  /*
   * Rimessa in lista, `takenAt` **sparisce** invece di diventare `undefined`, e
   * `wantedAt` si sposta a ora: riprendere una cosa dallo storico è richiederla
   * di nuovo, quindi torna in cima. → ADR-0089
   */
  it('rimessa in lista, torna in cima e non porta più la data di quando era presa', () => {
    const preso = applyShoppingOps(applyShoppingOps(LISTA, [metti(VOCE)]), [
      prendi(VOCE.id, '2026-09-03T18:30:00.000Z'),
    ])
    const next = applyShoppingOps(preso, [rimetti(VOCE.id, '2026-09-04T08:00:00.000Z')])
    expect(next.items[0]).not.toHaveProperty('takenAt')
    expect(next.items[0]?.wantedAt).toBe('2026-09-04T08:00:00.000Z')
  })

  it('si corregge, e un campo si cancella con la stringa vuota', () => {
    const con = applyShoppingOps(LISTA, [metti({ ...VOCE, note: 'quello intero', store: 'Coop' })])
    const senza = applyShoppingOps(con, [
      { kind: 'list-edit', itemId: VOCE.id, fields: { note: '', store: '' }, entryId: 'e', ts: 2 },
    ])
    expect(senza.items[0]).not.toHaveProperty('note')
    expect(senza.items[0]).not.toHaveProperty('store')
  })

  /*
   * La quantità è un numero, quindi la stringa vuota non è una strada: si toglie
   * con **zero**, che sopravvive al JSON e non vuol dire niente su una cosa da
   * comprare. E togliendo la quantità cade anche l'unità, perché «L di latte»
   * senza il numero non vuol dire niente. → ADR-0088
   */
  it('la quantità si cancella con zero, e si porta via l’unità', () => {
    const con = applyShoppingOps(LISTA, [metti(VOCE)])
    const senza = applyShoppingOps(con, [
      { kind: 'list-edit', itemId: VOCE.id, fields: { qty: 0 }, entryId: 'e', ts: 2 },
    ])
    expect(senza.items[0]).not.toHaveProperty('qty')
    expect(senza.items[0]).not.toHaveProperty('unit')
  })

  it('ripulisce gli spazi del titolo e del negozio', () => {
    const next = applyShoppingOps(LISTA, [metti({ ...VOCE, title: '  Latte ', store: ' Coop ' })])
    expect(next.items[0]?.title).toBe('Latte')
    expect(next.items[0]?.store).toBe('Coop')
  })

  it('sopravvive al giro in localStorage', () => {
    const round = JSON.parse(JSON.stringify(metti(VOCE))) as OutboxEntry
    expect(round).toEqual(metti(VOCE))
    expect(applyShoppingOps(LISTA, [round]).items[0]?.title).toBe('Latte')
  })

  it('senza il file della lista si dice «non ancora», non «sì»', () => {
    /* `undefined` non è una lista vuota: prima che il file esista, un
       `list-delete` risulterebbe applicato e uscirebbe dalla coda senza essere
       mai partito. */
    expect(isAlreadyApplied(remoto(DATASET), metti(VOCE))).toBe(false)
    expect(
      isAlreadyApplied(remoto(DATASET), { kind: 'list-delete', itemId: VOCE.id, entryId: 'd', ts: 1 }),
    ).toBe(false)
  })

  /*
   * **Si guarda lo stato, non l'istante.** Se la cosa l'ha presa anche l'altra
   * persona, il `takenAt` nel repo è il suo: confrontando gli istanti la mia
   * operazione non risulterebbe mai applicata e resterebbe in coda quattordici
   * giorni, riapplicandosi a ogni caricamento.
   */
  it('una spunta si riconosce dallo stato, anche se l’ha presa l’altra persona', () => {
    const suo = applyShoppingOps(applyShoppingOps(LISTA, [metti(VOCE)]), [
      prendi(VOCE.id, '2026-09-03T17:00:00.000Z'),
    ])
    const mia = prendi(VOCE.id, '2026-09-03T18:30:00.000Z')
    expect(isAlreadyApplied(remoto(DATASET, { shopping: suo.items }), mia)).toBe(true)
  })

  it('una correzione si riconosce confrontando l’intenzione normalizzata', () => {
    const con = applyShoppingOps(LISTA, [metti({ ...VOCE, note: 'quello intero' })])
    const togli: OutboxEntry = {
      kind: 'list-edit',
      itemId: VOCE.id,
      fields: { note: '' },
      entryId: 'e',
      ts: 2,
    }
    const senza = applyShoppingOps(con, [togli])
    expect(isAlreadyApplied(remoto(DATASET, { shopping: con.items }), togli)).toBe(false)
    expect(isAlreadyApplied(remoto(DATASET, { shopping: senza.items }), togli)).toBe(true)
  })

  it('aggiunta e cancellata, la voce non torna in lista', () => {
    /* Il fantasma di ADR-0069 su un tipo nuovo: potate una per una, le due
       operazioni si annullano male e ogni caricamento riapplica l'aggiunta. */
    const elimina: OutboxEntry = { kind: 'list-delete', itemId: VOCE.id, entryId: 'd', ts: 2 }
    const pruned = pruneSettled(
      { pending: [], settled: [metti(VOCE), elimina] },
      remoto(DATASET, { shopping: [] }),
      1000,
    )
    expect(applyShoppingOps(LISTA, pruned.settled).items).toEqual([])
  })

  /* La catena, sull'operazione più frequente: prendi e rimetti **già
     committate** si potano insieme, o la cosa tornerebbe spuntata da sé. */
  it('presa e rimessa in lista, già committate, escono insieme dalla coda', () => {
    const inLista = applyShoppingOps(LISTA, [metti(VOCE)])
    const pruned = pruneSettled(
      {
        pending: [],
        settled: [
          prendi(VOCE.id, '2026-09-03T18:00:00.000Z'),
          rimetti(VOCE.id, '2026-09-03T18:01:00.000Z'),
        ],
      },
      remoto(DATASET, { shopping: inLista.items }),
      1000,
    )
    expect(pruned.settled).toEqual([])
  })
})

describe('la coppia di spunte che non è ancora partita', () => {
  const presa = prendi(VOCE.id, '2026-09-03T18:00:00.000Z')

  /*
   * «Una spunta si può anche togliere e quindi è come se non fosse stata mai
   * messa», parole di Alessio. Senza questo, un dito scivolato lascerebbe nella
   * storia pubblica «1 cosa presa, 1 cosa rimessa in lista». → ADR-0091
   */
  it('la rimessa in lista annulla la spunta in coda', () => {
    const gemella = pendingTwin([presa], { kind: 'list-untake', itemId: VOCE.id, at: 'x' })
    expect(gemella?.entryId).toBe(presa.entryId)
  })

  it('e vale nei due versi', () => {
    const rimessa = rimetti(VOCE.id, '2026-09-03T18:00:00.000Z')
    const gemella = pendingTwin([rimessa], { kind: 'list-take', itemId: VOCE.id, at: 'x' })
    expect(gemella?.entryId).toBe(rimessa.entryId)
  })

  it('solo sulla stessa voce', () => {
    expect(pendingTwin([presa], { kind: 'list-untake', itemId: 'altra', at: 'x' })).toBeUndefined()
  })

  it('e solo fra prendi e rimetti', () => {
    /* Aggiungi e cancella **non** si annullano qui: le due non sono l'una
       l'inversa dell'altra — cancellare una voce mai partita brucia comunque un
       id — e la potatura per catena le gestisce già. */
    expect(pendingTwin([metti(VOCE)], { kind: 'list-delete', itemId: VOCE.id })).toBeUndefined()
    expect(pendingTwin([presa], { kind: 'list-edit', itemId: VOCE.id, fields: {} })).toBeUndefined()
  })

  it('non guarda quello che è già stato committato', () => {
    /* Solo `pending`: una spunta già nel repo è storia, e si corregge con
       un'operazione nuova che dice come stanno le cose adesso. */
    expect(pendingTwin([], { kind: 'list-untake', itemId: VOCE.id, at: 'x' })).toBeUndefined()
  })

  it('con più operazioni in coda prende l’ultima, non la prima', () => {
    const primaPresa = prendi(VOCE.id, '2026-09-03T18:00:00.000Z', 2)
    const rimessa = rimetti(VOCE.id, '2026-09-03T18:01:00.000Z', 3)
    const secondaPresa = prendi(VOCE.id, '2026-09-03T18:02:00.000Z', 4)
    const coda = [primaPresa, rimessa, secondaPresa]
    const gemella = pendingTwin(coda, { kind: 'list-untake', itemId: VOCE.id, at: 'x' })
    expect(gemella?.entryId).toBe(secondaPresa.entryId)
  })
})
