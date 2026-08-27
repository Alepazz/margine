/**
 * Costruire un rimborso.
 *
 * Sta qui, e non dentro la pagina Saldo, da quando il rimborso si registra da
 * **due posti**: la pagina, con l'importo parziale, e il Riepilogo, che chiude
 * il conto in un tocco. Il pezzo condiviso è piccolo — un id, una data, un
 * verso — ma è quello che non deve poter divergere: un rimborso costruito con
 * `from` e `to` scambiati sposta un debito nel verso sbagliato e non se ne
 * accorge nessuno finché il saldo non raddoppia. → ADR-0060, ADR-0019
 */

import { newSettlementId } from './ids'
import { toCents } from './money'
import type { PersonId, Settlement } from './types'

/**
 * Chi paga e chi incassa, dato il saldo di chi guarda. `null` **se siete in
 * pari**, perché a saldo zero un debitore non c'è.
 *
 * Esportata perché serve a due domande che devono avere la stessa risposta: la
 * pagina Saldo la usa per **dirlo a parole** («il rimborso va da Federica ad
 * Alessio») prima ancora che il rimborso esista, e il Riepilogo per sapere **a
 * chi mostrare il pulsante** per saldare. Se le due la ricavassero per conto
 * proprio potrebbero dire cose diverse. → ADR-0060, ADR-0062
 *
 * Il `null` non è pignoleria di tipi: tornando una coppia anche a zero, il ramo
 * «altrimenti» nominava **chi guarda** come debitore, e il pulsante per saldare
 * compariva a saldo pari. Un tipo che non sa dire «nessuno» costringe ogni
 * chiamante a ricordarsi il caso, e prima o poi uno se lo dimentica: è successo
 * lo stesso giorno in cui questa funzione è nata.
 */
export function settlementDirection(
  owedToViewer: number,
  viewer: PersonId,
  other: PersonId,
): { debtor: PersonId; creditor: PersonId } | null {
  const cents = toCents(owedToViewer)
  if (cents === 0) return null
  return cents > 0 ? { debtor: other, creditor: viewer } : { debtor: viewer, creditor: other }
}

/**
 * Il rimborso, o `null` se l'importo non è un numero diverso da zero.
 *
 * Torna `null` invece di lanciare perché l'importo arriva da un campo di testo
 * scritto col pollice: «non è un importo» è un esito previsto, non un guasto, e
 * chi chiama sa già come dirlo a chi guarda.
 *
 * Del segno non gli importa: il verso lo dicono `debtor` e `creditor`, quindi
 * un `−393` è lo stesso rimborso di un `393`. È voluto — chi chiama ha in mano
 * un saldo, che un segno ce l'ha già, e rifiutarlo vorrebbe dire far dipendere
 * la correttezza da un `Math.abs()` ricordato a memoria in ogni chiamante.
 */
export function newSettlement(opts: {
  /**
   * Il saldo dal punto di vista di chi guarda: **positivo** vuol dire che
   * l'altra persona deve a te. È da qui che si ricava il verso — non da chi
   * chiama, che altrimenti dovrebbe ricordarselo in ogni pagina.
   */
  owedToViewer: number
  /** Chi sta guardando. */
  viewer: PersonId
  /** L'altra persona. */
  other: PersonId
  /** Quanto si rimborsa: tutto, o una parte. Il segno non conta. */
  amount: number
  date: string
}): Settlement | null {
  /* `=== 0` prende anche `-0`, che è uguale a zero per `===`. */
  if (!Number.isFinite(opts.amount) || opts.amount === 0) return null
  /* In pari non c'è niente da rimborsare, e infatti un verso non esiste. */
  const verso = settlementDirection(opts.owedToViewer, opts.viewer, opts.other)
  if (verso === null) return null
  const { debtor, creditor } = verso
  return {
    id: newSettlementId(opts.date),
    date: opts.date,
    from: debtor,
    to: creditor,
    /* Sempre positivo: il verso lo dicono `from` e `to`, e un importo negativo
       con un verso già suo vorrebbe dire due volte la stessa cosa — con la
       possibilità che le due dicano cose diverse. */
    amount: Math.round(Math.abs(opts.amount) * 100) / 100,
  }
}
