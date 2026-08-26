import { describe, expect, it } from 'vitest'

import { OP_WORDS, describeOps } from '../data/outbox'
import type { Op, OutboxEntry } from '../data/outbox'
import {
  APP_COMMIT_SUFFIX,
  badgeLabel,
  groupsOfSummary,
  parseChanges,
  unseenSince,
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
