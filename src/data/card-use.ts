/**
 * Quando hai aperto una tessera l'ultima volta, su **questo** dispositivo.
 *
 * È un segno del telefono e non un dato condiviso, come l'identità o il velo
 * sui guadagni: la carta che usi ogni settimana deve salire sul tuo elenco senza
 * muovere quello dell'altra persona. E metterlo nei dati vorrebbe dire un
 * commit ogni volta che si apre una tessera alla cassa, cioè un commit per ogni
 * spesa fatta — per un'informazione che nessuno dei due userà mai per rispondere
 * a una domanda. → ADR-0082
 *
 * Senza `localStorage` non succede niente di grave: l'ordine «usate di recente»
 * coincide con quello per nome, che è il ripiego giusto.
 */

const KEY = 'margine.cards.lastUsed.v1'

/**
 * Quante carte ricordare.
 *
 * Il tetto c'è perché la mappa non cresca per sempre con gli id delle carte
 * cancellate: chi le apre non le rilegge mai, e una voce orfana non si può
 * accorgere di essere orfana. Trenta è oltre il numero di carte che un
 * portafoglio contiene.
 */
const MAX = 30

export type LastUsed = Record<string, number>

export function readLastUsed(): LastUsed {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const out: LastUsed = {}
    for (const [id, when] of Object.entries(parsed)) {
      if (typeof when === 'number' && Number.isFinite(when)) out[id] = when
    }
    return out
  } catch {
    return {}
  }
}

/** Segna che questa carta è stata aperta adesso, e torna la mappa aggiornata. */
export function markCardUsed(cardId: string, now: number = Date.now()): LastUsed {
  const next = { ...readLastUsed(), [cardId]: now }
  /* Le più vecchie escono quando si supera il tetto. */
  const kept = Object.entries(next)
    .sort(([, a], [, b]) => b - a)
    .slice(0, MAX)
  const trimmed: LastUsed = Object.fromEntries(kept)
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed))
  } catch {
    /* Niente storage: l'ordine per uso recente resta quello per nome. */
  }
  return trimmed
}
