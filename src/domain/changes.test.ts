import { describe, expect, it } from 'vitest'

import { OP_WORDS, applyOps, describeOps } from '../data/outbox'
import { diffExpenses, movesMoney, type ExpenseDelta } from './diff'
import type { Dataset, Expense } from './types'
import type { Op, OutboxEntry } from '../data/outbox'
import {
  APP_COMMIT_SUFFIX,
  EXPENSE_KINDS,
  PHRASES,
  badgeLabel,
  countOfSummary,
  groupsOfSummary,
  noticesOf,
  parseChanges,
  partsOfSummary,
  phraseOf,
  SILENT_KINDS,
  COLLAPSED_GROUPS,
  touchesExpenses,
  unseenCount,
  unseenSince,
  CHANGE_GROUPS,
  GROUP_LABELS,
  type Change,
  type RawCommit,
} from './changes'

function commit(over: Partial<RawCommit> = {}): RawCommit {
  return {
    sha: 'abc123',
    message: `1 spesa aggiunta${APP_COMMIT_SUFFIX}`,
    login: 'federicaspuriforotti',
    name: 'Federica',
    date: '2026-08-26T10:00:00.000Z',
    parent: 'parent0',
    ...over,
  }
}

describe('parità col vocabolario delle operazioni', () => {
  /*
   * La garanzia che tiene in piedi tutto il resto: ciò che `describeOps`
   * scrive, `groupsOfSummary` lo sa rileggere. Se un giorno si aggiunge
   * un'operazione a `Op` senza pensarci, questo test cade — mentre l'app
   * continuerebbe a funzionare mostrando una riga senza gruppo, cioè una novità
   * che nessuna spunta di Impostazioni può accendere o spegnere.
   */
  it('ogni tipo di operazione fa il giro completo e torna un gruppo', () => {
    for (const kind of Object.keys(OP_WORDS) as Op['kind'][]) {
      const entry = { kind, ts: 1 } as unknown as OutboxEntry
      const uno = describeOps([entry])
      expect(groupsOfSummary(uno), `singolare di ${kind}: «${uno}»`).toHaveLength(1)

      const due = describeOps([entry, { ...entry }])
      expect(groupsOfSummary(due), `plurale di ${kind}: «${due}»`).toHaveLength(1)
    }
  })

  /*
   * `PHRASES` è la seconda coniugazione dello stesso vocabolario: se un tipo
   * nuovo arriva in `OP_WORDS` senza una frase, la notifica direbbe «Federica
   * ha fatto undefined». Il tipo lo impedisce a compilazione, questo lo dice
   * anche a chi legge — e prova che la frase non resti vuota.
   */
  it('ogni tipo ha una frase, al singolare e al plurale', () => {
    for (const kind of Object.keys(OP_WORDS) as Op['kind'][]) {
      expect(phraseOf({ kind, count: 1 }), `singolare di ${kind}`).toMatch(/\S/)
      const tre = phraseOf({ kind, count: 3 })
      expect(tre, `plurale di ${kind}`).toMatch(/\S/)
      expect(tre, `«{n}» non sostituito in ${kind}`).not.toContain('{n}')
      /* Dove la lingua distingue, il numero deve comparire. */
      if (PHRASES[kind][0] !== PHRASES[kind][1]) expect(tre).toContain('3')
    }
  })

  /* Due tipi che condividessero una parola renderebbero la mappa inversa
     ambigua, e il gruppo dipenderebbe dall'ordine di dichiarazione. */
  it('nessuna parola appartiene a due tipi diversi', () => {
    const seen = new Map<string, string>()
    for (const [kind, [one, many]] of Object.entries(OP_WORDS)) {
      for (const word of new Set([one, many])) {
        expect(seen.has(word), `«${word}» è di ${seen.get(word)} e di ${kind}`).toBe(false)
        seen.set(word, kind)
      }
    }
  })
})

describe('quante cose ha toccato un commit', () => {
  it('somma i pezzi del messaggio', () => {
    expect(countOfSummary('3 spese aggiunte')).toBe(3)
    expect(countOfSummary('2 spese aggiunte, 1 prezzo rilevato')).toBe(3)
    expect(countOfSummary('1 spesa aggiunta, 2 spese corrette, 1 rimborso registrato')).toBe(4)
  })

  it('ciò che non riconosce non conta', () => {
    expect(countOfSummary('3 rane cotte')).toBe(0)
    expect(countOfSummary('3 rane cotte, 2 spese aggiunte')).toBe(2)
  })

  it('le parti portano tipo e numero', () => {
    expect(partsOfSummary('2 spese aggiunte, 1 prezzo rilevato')).toEqual([
      { kind: 'create', count: 2 },
      { kind: 'price', count: 1 },
    ])
  })

  it('le operazioni sulle spese sono quelle che hanno un dettaglio', () => {
    expect([...EXPENSE_KINDS].sort()).toEqual(['create', 'delete', 'patch', 'update'])
  })
})

/*
 * La guardia che decide se vale la pena scaricare due file da 367 kB. Si
 * risponde dal **messaggio**, senza rete: è quello che la rende utile.
 * → ADR-0087
 */
describe('quali commit hanno un dettaglio da leggere', () => {
  /*
   * Costruita a mano e non con `parseChanges`, che scarta i commit senza gruppi
   * accesi: un messaggio che non si riconosce non arriverebbe mai fino qui, e
   * la guardia deve dire la sua anche su quello.
   */
  const change = (summary: string): Change => ({
    sha: 'abc123',
    at: '2026-09-03T10:00:00.000Z',
    who: 'Federica',
    summary,
    groups: groupsOfSummary(summary),
    parent: 'parent0',
    count: countOfSummary(summary),
    parts: partsOfSummary(summary),
  })

  it('un commit di spese sì', () => {
    expect(touchesExpenses(change('2 spese aggiunte'))).toBe(true)
    expect(touchesExpenses(change('1 spesa corretta'))).toBe(true)
  })

  /*
   * Un'annotazione tocca le spese ma è muta (→ ADR-0094): non potendo fare una
   * riga, il suo dettaglio non serve a nessuno e i 734 kB si risparmiano. È il
   * silenzio che costa zero — quello che si deduce dal messaggio.
   */
  it('un commit di sole annotazioni no, perché non farebbe nessuna riga', () => {
    expect(touchesExpenses(change('1 annotazione'))).toBe(false)
    expect(touchesExpenses(change('3 annotazioni'))).toBe(false)
  })

  /* Misto: la spesa vuole il dettaglio, quindi si scarica comunque. */
  it('un commit misto sì, per la parte che una riga la farebbe', () => {
    expect(touchesExpenses(change('1 annotazione, 1 spesa aggiunta'))).toBe(true)
  })

  it('un commit che non tocca le spese no', () => {
    expect(touchesExpenses(change('3 cose aggiunte alla lista'))).toBe(false)
    expect(touchesExpenses(change('5 cose prese'))).toBe(false)
    expect(touchesExpenses(change('2 prezzi rilevati'))).toBe(false)
    expect(touchesExpenses(change('1 carta aggiunta'))).toBe(false)
    expect(touchesExpenses(change('categorie aggiornate'))).toBe(false)
  })

  /* Il caso che impedisce di trasformare la guardia in «il commit è tutto di
     lista?»: un salvataggio può portare le due cose insieme, e allora il
     dettaglio serve. */
  it('un commit misto sì', () => {
    expect(touchesExpenses(change('1 prezzo rilevato, 1 spesa aggiunta'))).toBe(true)
  })

  /* Un messaggio che non si riconosce non ha parti, quindi non ha spese: senza
     questo ramo il ripiego sarebbe «scarica», cioè il difetto di prima per
     qualunque messaggio scritto a mano che finisse per caso col suffisso. */
  it('un messaggio che non si riconosce no', () => {
    expect(touchesExpenses(change('3 rane cotte'))).toBe(false)
  })
})

describe('la frase', () => {
  it('al singolare non porta numeri', () => {
    expect(phraseOf({ kind: 'create', count: 1 })).toBe('ha aggiunto una spesa')
  })

  it('al plurale mette il numero', () => {
    expect(phraseOf({ kind: 'price', count: 4 })).toBe('ha rilevato 4 prezzi')
  })

  /* «Le categorie» non ha singolare né plurale: la frase è la stessa e non
     deve comparirci un numero appiccicato. */
  it('dove la lingua non distingue, resta uguale', () => {
    expect(phraseOf({ kind: 'categories', count: 1 })).toBe('ha aggiornato le categorie')
    expect(phraseOf({ kind: 'categories', count: 3 })).toBe('ha aggiornato le categorie')
  })
})

describe('lettura del messaggio', () => {
  it('riconosce più operazioni nello stesso commit', () => {
    expect(groupsOfSummary('2 spese aggiunte, 1 prezzo rilevato')).toEqual(['spese', 'prezzi'])
  })

  it('non ripete un gruppo toccato due volte', () => {
    expect(groupsOfSummary('2 spese aggiunte, 1 spesa corretta')).toEqual(['spese'])
  })

  it('ignora ciò che non riconosce invece di inventare un gruppo', () => {
    expect(groupsOfSummary('qualcosa di scritto a mano')).toEqual([])
    expect(groupsOfSummary('3 rane cotte, 1 spesa aggiunta')).toEqual(['spese'])
  })
})

describe('quali commit diventano novità', () => {
  it('tiene solo quelli scritti dalla UI', () => {
    const raw = [
      commit({ sha: 'app', message: `1 spesa aggiunta${APP_COMMIT_SUFFIX}` }),
      commit({ sha: 'codice', message: 'Il foglio di dettaglio ha un corpo che scorre' }),
      commit({ sha: 'import', message: 'Dati aggiornati dalla sessione mensile' }),
    ]
    expect(parseChanges(raw).map((c) => c.sha)).toEqual(['app'])
  })

  /*
   * Il rename dell'03/09/2026 non deve rendere muta la storia già scritta: due
   * anni di commit portano «(da Margine)», e il repo è pubblico — quella storia
   * non si riscrive. Se un giorno il suffisso venisse *sostituito* invece che
   * aggiunto, la campanella smetterebbe di vedere tutto il passato senza un
   * errore, e questo test è l'unica cosa che se ne accorge. → ADR-0092
   */
  it('legge anche i commit col nome di prima del rename', () => {
    const raw = [
      commit({ sha: 'nuovo', message: '1 spesa aggiunta (da Giano)' }),
      commit({ sha: 'vecchio', message: '1 spesa aggiunta (da Margine)' }),
      commit({ sha: 'altrui', message: '1 spesa aggiunta (da Qualcosaltro)' }),
    ]
    const letti = parseChanges(raw)
    expect(letti.map((c) => c.sha)).toEqual(['nuovo', 'vecchio'])
    /* E il riassunto esce pulito da entrambi: se lo `slice` togliesse la
       lunghezza sbagliata resterebbe un pezzo di nome attaccato. */
    expect(letti.map((c) => c.summary)).toEqual(['1 spesa aggiunta', '1 spesa aggiunta'])
  })

  it('il suffisso vale solo sulla prima riga', () => {
    const raw = [commit({ sha: 'corpo', message: `Titolo vero\n\n1 spesa aggiunta${APP_COMMIT_SUFFIX}` })]
    expect(parseChanges(raw)).toEqual([])
  })

  it('scarta i miei, tiene quelli dell’altra persona', () => {
    const raw = [
      commit({ sha: 'mio', login: 'Alepazz' }),
      commit({ sha: 'suo', login: 'federicaspuriforotti' }),
    ]
    expect(parseChanges(raw, { myLogin: 'Alepazz' }).map((c) => c.sha)).toEqual(['suo'])
  })

  /* Senza token il login è ignoto: meglio un elenco che comprende anche le mie
     righe di un elenco vuoto che non si sa spiegare. */
  it('senza il mio login non filtra nessuno', () => {
    const raw = [commit({ sha: 'mio', login: 'Alepazz' }), commit({ sha: 'suo' })]
    expect(parseChanges(raw).map((c) => c.sha)).toEqual(['mio', 'suo'])
  })

  it('ripiega sul nome quando il login non c’è', () => {
    const raw = [commit({ login: null, name: 'Federica' })]
    expect(parseChanges(raw)[0]?.who).toBe('Federica')
  })

  it('rispetta i gruppi accesi in Impostazioni', () => {
    const raw = [
      commit({ sha: 'spesa', message: `1 spesa aggiunta${APP_COMMIT_SUFFIX}` }),
      commit({ sha: 'prezzo', message: `1 prezzo rilevato${APP_COMMIT_SUFFIX}` }),
      commit({ sha: 'misto', message: `1 spesa aggiunta, 1 prezzo rilevato${APP_COMMIT_SUFFIX}` }),
    ]
    const solo = parseChanges(raw, { groups: ['prezzi'] })
    expect(solo.map((c) => c.sha).sort()).toEqual(['misto', 'prezzo'])
  })

  it('ordina dalla più recente', () => {
    const raw = [
      commit({ sha: 'vecchio', date: '2026-08-20T09:00:00.000Z' }),
      commit({ sha: 'nuovo', date: '2026-08-26T09:00:00.000Z' }),
      commit({ sha: 'mezzo', date: '2026-08-24T09:00:00.000Z' }),
    ]
    expect(parseChanges(raw).map((c) => c.sha)).toEqual(['nuovo', 'mezzo', 'vecchio'])
  })

  it('toglie il suffisso dal riassunto', () => {
    expect(parseChanges([commit()])[0]?.summary).toBe('1 spesa aggiunta')
  })

  it('porta con sé quante cose ha toccato', () => {
    const raw = [commit({ message: `2 spese aggiunte, 1 prezzo rilevato${APP_COMMIT_SUFFIX}` })]
    const change = parseChanges(raw)[0]!
    expect(change.count).toBe(3)
    expect(change.parts).toHaveLength(2)
  })
})

describe('cosa è ancora da vedere', () => {
  const changes = parseChanges([
    commit({ sha: 'a', date: '2026-08-26T12:00:00.000Z' }),
    commit({ sha: 'b', date: '2026-08-26T10:00:00.000Z' }),
    commit({ sha: 'c', date: '2026-08-25T10:00:00.000Z' }),
  ])

  it('solo ciò che è arrivato dopo', () => {
    expect(unseenSince(changes, '2026-08-26T10:00:00.000Z').map((c) => c.sha)).toEqual(['a'])
  })

  /* L'ora esatta di `seenAt` è quella del commit che ha fatto salvare il
     timestamp: è già stato visto, e ricomparirebbe per sempre. */
  it('l’ora esatta di seenAt è già vista', () => {
    expect(unseenSince(changes, '2026-08-26T12:00:00.000Z')).toEqual([])
  })

  it('senza seenAt è tutto nuovo', () => {
    expect(unseenSince(changes, undefined)).toHaveLength(3)
  })
})

describe('il pallino', () => {
  it('tace a zero e conta fino a nove', () => {
    expect(badgeLabel(0)).toBe('')
    expect(badgeLabel(-1)).toBe('')
    expect(badgeLabel(1)).toBe('1')
    expect(badgeLabel(9)).toBe('9')
  })

  it('oltre nove dice 9+', () => {
    expect(badgeLabel(10)).toBe('9+')
    expect(badgeLabel(438)).toBe('9+')
  })
})

describe('le righe della campanella', () => {
  const spesa = (id: string, tricount = 'condivise'): ExpenseDelta => ({
    kind: 'added',
    expense: {
      id,
      date: '2026-08-26',
      title: id,
      amount: 10,
      shares: { me: 5, partner: 5 },
      paidBy: 'partner',
      tricount,
      category: 'cibo',
      recurring: false,
    },
  })

  const change = (message: string) =>
    parseChanges([commit({ sha: 'c1', message: `${message}${APP_COMMIT_SUFFIX}` })])

  it('senza dettaglio: una riga per operazione, generica', () => {
    const righe = noticesOf(change('2 spese aggiunte, 1 prezzo rilevato'), () => ({}))
    expect(righe).toHaveLength(2)
    expect(righe.every((r) => r.kind === 'summary')).toBe(true)
    expect(righe[0]).toMatchObject({ kind: 'summary', pending: true })
    /* Un prezzo non ha un dettaglio da aspettare: non è «in arrivo». */
    expect(righe[1]).toMatchObject({ kind: 'summary', pending: undefined })
  })

  it('col dettaglio: una riga per spesa, e la generica sparisce', () => {
    const righe = noticesOf(change('2 spese aggiunte'), () => ({
      deltas: [spesa('aperitivo'), spesa('benzina')],
    }))
    expect(righe.map((r) => r.kind)).toEqual(['delta', 'delta'])
    expect(righe.map((r) => (r.kind === 'delta' ? r.delta.expense.id : ''))).toEqual([
      'aperitivo',
      'benzina',
    ])
  })

  /*
   * Ciò che sta fuori dai tricount di chi guarda non lascia **nessuna** traccia:
   * né riga né numero. È una richiesta esplicita di Alessio contro la prima
   * versione, che ne mostrava una a dire «e 1 fuori dai tuoi tricount» — una
   * notifica per qualcosa che non ti riguarda è rumore, e che sia successo
   * qualcosa nel personale dell'altra persona è già più di quanto serva sapere.
   */
  it('la spesa filtrata via non lascia traccia, nemmeno un conteggio', () => {
    const righe = noticesOf(change('2 spese aggiunte'), () => ({ deltas: [spesa('aperitivo')] }))
    expect(righe).toHaveLength(1)
    expect(righe[0]).toMatchObject({ kind: 'delta' })
  })

  it('un salvataggio tutto fuori sparisce del tutto', () => {
    expect(noticesOf(change('3 spese aggiunte'), () => ({ deltas: [] }))).toEqual([])
  })

  it('dettaglio fallito: resta la generica, e si sa che si può riprovare', () => {
    const righe = noticesOf(change('1 spesa aggiunta'), () => ({ failed: true }))
    expect(righe[0]).toMatchObject({ kind: 'summary', failed: true, pending: undefined })
  })

  /*
   * Due prezzi sono **una** riga che dice «2», non due righe: il conteggio del
   * pallino è la lunghezza di questo elenco, quindi vale 1. Ed è giusto — la
   * riga dichiara il proprio numero e si legge.
   */
  it('le operazioni non-spesa restano una riga, e non aspettano dettagli', () => {
    const righe = noticesOf(change('2 prezzi rilevati'), () => ({ deltas: [] }))
    expect(righe).toHaveLength(1)
    expect(righe[0]).toMatchObject({ kind: 'summary', pending: undefined })
  })
})

/*
 * Il pallino e l'elenco sono due segni diversi: chiudere il foglio dice «viste»
 * e spegne il pallino, il pulsante dice «archiviate» e svuota l'elenco. Con un
 * segno solo i due gesti erano lo stesso gesto. → ADR-0061
 */
describe('quante righe non sono ancora state guardate', () => {
  const righe = [{ at: '2026-08-27T12:00:00Z' }, { at: '2026-08-27T10:00:00Z' }, { at: '2026-08-26T09:00:00Z' }]

  it('senza segno di lettura le conta tutte', () => {
    expect(unseenCount(righe, undefined)).toBe(3)
  })

  it('conta solo quelle più recenti del segno', () => {
    expect(unseenCount(righe, '2026-08-27T09:00:00Z')).toBe(2)
    expect(unseenCount(righe, '2026-08-27T11:00:00Z')).toBe(1)
  })

  /* Il segno è preso dalla più recente, quindi «uguale» vuol dire vista. */
  it('la riga esattamente al segno è già vista', () => {
    expect(unseenCount(righe, '2026-08-27T12:00:00Z')).toBe(0)
  })

  /* L'elenco resta pieno anche a pallino spento: è l'invariante del diff. */
  it('non tocca l’elenco, che resta lungo com’era', () => {
    expect(unseenCount(righe, '2026-08-27T12:00:00Z')).toBe(0)
    expect(righe).toHaveLength(3)
  })

  it('su un elenco vuoto fa zero comunque', () => {
    expect(unseenCount([], undefined)).toBe(0)
    expect(unseenCount([], '2026-08-27T12:00:00Z')).toBe(0)
  })
})

/*
 * Le spunte non sono novità: venti righe «ha preso una cosa» seppellirebbero le
 * novità vere, e la cosa presa la si vede nella lista. Il silenzio si ottiene in
 * `noticesOf`, così l'elenco e il pallino restano la stessa cosa. → ADR-0091
 */
describe('le operazioni mute', () => {
  const senzaDettaglio = () => ({})

  const spesaViva = (): Expense => ({
    id: 'e1',
    date: '2026-08-26',
    title: 'Assicurazione',
    amount: 340,
    shares: { me: 170, partner: 170 },
    paidBy: 'partner',
    tricount: 'condivise',
    category: 'casa',
    recurring: false,
  })

  const datasetCon = (...expenses: Expense[]): Dataset =>
    ({
      version: 1,
      updatedAt: '2026-09-03T10:00:00.000Z',
      expenses,
      tricounts: [],
      settlements: [],
      prices: [],
    }) as unknown as Dataset

  /*
   * Le due spunte, e le annotazioni: quelle per deduzione, non per scelta —
   * un'annotazione tocca nota, scontrino, 730 e welfare, e nessuno dei quattro
   * è un campo del denaro. → ADR-0094
   */
  it('sono le due spunte e le annotazioni, e nient’altro', () => {
    expect([...SILENT_KINDS].sort()).toEqual(['list-take', 'list-untake', 'patch'])
  })

  it('un commit di sole annotazioni non fa nessuna riga', () => {
    const changes = parseChanges([commit({ message: `2 annotazioni${APP_COMMIT_SUFFIX}` })])
    expect(changes).toHaveLength(1)
    expect(noticesOf(changes, senzaDettaglio)).toEqual([])
  })

  /*
   * Il test che rende **sound** il silenzio di `patch`, e non solo comodo.
   *
   * `SILENT_KINDS` dà l'annotazione per muta senza guardare il confronto, sulla
   * deduzione che nessuno dei campi di `Annotation` sia denaro. Elencare quei
   * campi a mano non presidia niente: se `applyPatch` un giorno ne toccasse uno
   * in più, la lista scritta qui resterebbe di quattro e il silenzio comincerebbe
   * a nascondere un importo. Quindi l'annotazione si **applica davvero**, con
   * tutti i suoi campi addosso, e si chiede al confronto se ha mosso dei soldi.
   * → ADR-0094
   */
  it('un’annotazione applicata per davvero non muove denaro', () => {
    const prima = spesaViva()
    const dopo = applyOps(datasetCon(prima), [
      {
        kind: 'patch',
        ts: 1,
        entryId: '1-0-patch',
        expenseId: prima.id,
        tax730: true,
        welfare: true,
        notes: 'pagata a rate',
        receiptLinks: ['https://esempio/scontrino'],
      },
    ])
    const deltas = diffExpenses(datasetCon(prima), dopo)
    /* Il confronto la vede cambiata — quindi il test non è vuoto — ma non nei
       campi del denaro. */
    expect(deltas).toHaveLength(1)
    expect(deltas[0]?.kind).toBe('changed')
    expect(movesMoney(deltas[0]!)).toBe(false)
  })

  it('un commit di sole spunte non fa nessuna riga', () => {
    const changes = parseChanges([
      commit({ message: `3 cose prese, 1 cosa rimessa in lista${APP_COMMIT_SUFFIX}` }),
    ])
    expect(changes).toHaveLength(1)
    expect(noticesOf(changes, senzaDettaglio)).toEqual([])
  })

  it('in un commit misto restano le righe che non sono mute', () => {
    const changes = parseChanges([
      commit({ message: `2 cose prese, 1 cosa aggiunta alla lista${APP_COMMIT_SUFFIX}` }),
    ])
    const righe = noticesOf(changes, senzaDettaglio)
    expect(righe).toHaveLength(1)
    /* La cosa aggiunta c'è, ma come riga di gruppo: la lista collassa. → ADR-0095 */
    expect(righe[0]?.kind).toBe('group')
  })

  /* Il gruppo esiste e le cinque operazioni gli rispondono: senza, la riga non
     avrebbe una spunta in Impostazioni che la possa spegnere. → ADR-0054 */
  it('la lista è un gruppo suo, accanto ai prezzi', () => {
    expect(CHANGE_GROUPS).toContain('lista')
    expect(groupsOfSummary('1 cosa aggiunta alla lista')).toEqual(['lista'])
    expect(groupsOfSummary('1 cosa presa')).toEqual(['lista'])
    expect(GROUP_LABELS.lista).toMatch(/\S/)
  })

  /*
   * Il gruppo spento filtra **il commit**, quindi anche le righe non mute
   * sparisono: è la regola di ADR-0054, e vale per la lista come per gli altri.
   */
  it('col gruppo spento il commit non arriva nemmeno', () => {
    const raw = [commit({ message: `1 cosa aggiunta alla lista${APP_COMMIT_SUFFIX}` })]
    expect(parseChanges(raw, { groups: ['spese'] })).toEqual([])
  })
})

/*
 * «Alepazz ha aggiunto una cosa alla lista è troppo rumore, per ogni elemento.
 * Direi che metterei una generica notifica e fine, che compare ogni volta che
 * c'è almeno un elemento non ancora visualizzato tramite campanella» — Alessio,
 * il 03/09/2026. Ogni cosa aggiunta è un commit, quindi la spesa di una
 * settimana faceva venti righe e un pallino a `9+`. → ADR-0095
 */
describe('i gruppi che collassano in una riga sola', () => {
  const senzaDettaglio = () => ({})

  /** `n` commit, uno per cosa aggiunta, dal più recente al più vecchio. */
  const listaDi = (n: number) =>
    parseChanges(
      Array.from({ length: n }, (_, i) =>
        commit({
          sha: `c${i}`,
          message: `1 cosa aggiunta alla lista${APP_COMMIT_SUFFIX}`,
          date: `2026-09-03T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
        }),
      ),
    )

  it('la lista collassa, e nient’altro', () => {
    expect(COLLAPSED_GROUPS.lista).toMatch(/\S/)
    const altri = CHANGE_GROUPS.filter((g) => g !== 'lista')
    for (const gruppo of altri) expect(COLLAPSED_GROUPS[gruppo], gruppo).toBeUndefined()
  })

  it('venti commit di lista fanno una riga sola', () => {
    const righe = noticesOf(listaDi(20), senzaDettaglio)
    expect(righe).toHaveLength(1)
    expect(righe[0]?.kind).toBe('group')
  })

  /* Il pallino è il numero di righe non ancora guardate: venti cose valgono 1. */
  it('e il pallino dice 1, non 9+', () => {
    expect(badgeLabel(unseenCount(noticesOf(listaDi(20), senzaDettaglio), undefined))).toBe('1')
  })

  /*
   * L'istante è quello della novità **più recente**: è ciò che riaccende il
   * pallino quando ne arriva un'altra dopo che hai guardato. Con l'istante
   * della più vecchia la riga resterebbe «già vista» per sempre.
   */
  it('porta l’istante della novità più recente', () => {
    const righe = noticesOf(listaDi(3), senzaDettaglio)
    expect(righe[0]?.at).toBe('2026-09-03T12:00:00.000Z')
    /* Guardato a mezzogiorno: niente di nuovo. Poi ne arriva una alle 13. */
    expect(unseenCount(righe, '2026-09-03T12:00:00.000Z')).toBe(0)
    expect(unseenCount(noticesOf(listaDi(4), senzaDettaglio), '2026-09-03T12:00:00.000Z')).toBe(1)
  })

  it('non ha né soggetto né sha: sta a cavallo dei commit', () => {
    const riga = noticesOf(listaDi(3), senzaDettaglio)[0]!
    expect(riga.kind).toBe('group')
    expect(riga).not.toHaveProperty('who')
    expect(riga).not.toHaveProperty('sha')
  })

  it('aggiunte, modifiche ed eliminazioni finiscono nella stessa riga', () => {
    const changes = parseChanges([
      commit({ sha: 'c1', message: `2 cose aggiunte alla lista${APP_COMMIT_SUFFIX}` }),
      commit({ sha: 'c2', message: `1 voce della lista modificata${APP_COMMIT_SUFFIX}` }),
      commit({ sha: 'c3', message: `1 voce della lista eliminata${APP_COMMIT_SUFFIX}` }),
    ])
    expect(noticesOf(changes, senzaDettaglio)).toHaveLength(1)
  })

  it('senza novità di lista non c’è nessuna riga di gruppo', () => {
    const changes = parseChanges([commit({ message: `2 prezzi rilevati${APP_COMMIT_SUFFIX}` })])
    expect(noticesOf(changes, senzaDettaglio).every((r) => r.kind !== 'group')).toBe(true)
  })

  /*
   * La riga collassata non copre le altre novità del suo stesso commit: la cosa
   * aggiunta collassa, il prezzo resta una riga sua.
   */
  it('in un commit misto le altre novità restano', () => {
    const changes = parseChanges([
      commit({ message: `1 cosa aggiunta alla lista, 1 prezzo rilevato${APP_COMMIT_SUFFIX}` }),
    ])
    const righe = noticesOf(changes, senzaDettaglio)
    expect(righe).toHaveLength(2)
    expect(righe.map((r) => r.kind).sort()).toEqual(['group', 'summary'])
  })

  /* Le righe restano in ordine di tempo: quella di gruppo va dove le tocca. */
  it('si mette in ordine di tempo con le altre', () => {
    const changes = parseChanges([
      commit({ sha: 'c1', message: `1 prezzo rilevato${APP_COMMIT_SUFFIX}`, date: '2026-09-03T14:00:00.000Z' }),
      commit({ sha: 'c2', message: `1 cosa aggiunta alla lista${APP_COMMIT_SUFFIX}`, date: '2026-09-03T13:00:00.000Z' }),
      commit({ sha: 'c3', message: `2 prezzi rilevati${APP_COMMIT_SUFFIX}`, date: '2026-09-03T12:00:00.000Z' }),
    ])
    expect(noticesOf(changes, senzaDettaglio).map((r) => r.kind)).toEqual([
      'summary',
      'group',
      'summary',
    ])
  })
})

/*
 * Una correzione che non muove la cifra non è una novità: la regola sta in
 * `movesMoney`, e qui si prova che la campanella la applica — cioè che quella
 * riga non compare. → ADR-0094
 */
describe('le correzioni che non muovono la cifra', () => {
  const spesa = (over: Partial<Expense> = {}): Expense => ({
    id: 'e1',
    date: '2026-08-26',
    title: 'Assicurazione',
    amount: 340,
    shares: { me: 170, partner: 170 },
    paidBy: 'partner',
    tricount: 'condivise',
    category: 'casa',
    recurring: false,
    ...over,
  })

  const correzione = (over: Partial<Expense>): ExpenseDelta => ({
    kind: 'changed',
    expense: spesa(over),
    before: spesa(),
  })

  const changes = parseChanges([
    commit({ message: `1 spesa corretta${APP_COMMIT_SUFFIX}` }),
  ])

  it('un titolo corretto non fa riga, e il commit sparisce del tutto', () => {
    expect(noticesOf(changes, () => ({ deltas: [correzione({ title: 'Assicurazione auto' })] }))).toEqual([])
  })

  it('un importo corretto la fa', () => {
    const righe = noticesOf(changes, () => ({
      deltas: [correzione({ amount: 360, shares: { me: 180, partner: 180 } })],
    }))
    expect(righe).toHaveLength(1)
    expect(righe[0]?.kind).toBe('delta')
  })

  /* In un commit con due correzioni resta solo quella che muove i soldi. */
  it('in un commit misto resta solo quella che muove i soldi', () => {
    const righe = noticesOf(
      parseChanges([commit({ message: `2 spese corrette${APP_COMMIT_SUFFIX}` })]),
      () => ({
        deltas: [correzione({ category: 'auto' }), correzione({ paidBy: 'me' })],
      }),
    )
    expect(righe).toHaveLength(1)
    expect(righe[0]?.kind === 'delta' ? righe[0].delta.expense.paidBy : undefined).toBe('me')
  })

  /*
   * Il prezzo dichiarato: finché il dettaglio non è arrivato non si può sapere
   * se la cifra si è mossa, quindi la riga generica compare e poi sparisce. È
   * la stessa finestra di ADR-0052 per le spese fuori dai propri tricount, e
   * dura una richiesta.
   */
  it('prima del dettaglio la riga generica c’è', () => {
    const righe = noticesOf(changes, () => ({}))
    expect(righe).toHaveLength(1)
    expect(righe[0]).toMatchObject({ kind: 'summary', pending: true })
  })
})
