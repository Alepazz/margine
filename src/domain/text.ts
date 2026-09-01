/**
 * Normalizzazione di testo scritto a mano.
 *
 * Sta in un file suo, neutro, perché serve a due cose che non devono dipendere
 * l'una dall'altra: raggruppare le rilevazioni di prezzo per prodotto
 * (`domain/prices.ts`) e riconoscere la stessa spesa ricorrente mese dopo mese
 * (`recurringProfile` in `domain/selectors.ts`). Importarla da `prices.ts`
 * avrebbe legato le statistiche ai prezzi per una riga di codice.
 */

/**
 * La chiave con cui due testi sono lo stesso testo: senza spazi ai bordi, con
 * gli spazi interni collassati, minuscolo.
 *
 * Gli accenti **restano**: in italiano distinguono parole — «pero» e «però», «e»
 * ed «è» — e toglierli farebbe collassare cose diverse. È il contrario di quello
 * che fa `slugify` in `domain/ids.ts`, che produce un id per un URL e lì gli
 * accenti danno solo fastidio.
 */
export function nameKey(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * «a» o «ad» davanti a un nome: la d eufonica.
 *
 * «Devi a Alessio» è sbagliato, «devi ad Alessio» no. Non è una finezza da
 * grammatico: i nomi arrivano dalla configurazione, quindi la frase giusta non
 * si può scegliere una volta per tutte scrivendola a mano.
 *
 * Stava dentro `Saldo.tsx`, ed è tornata a mancare appena un secondo posto ha
 * avuto bisogno di dire la stessa frase — il saldo nel Riepilogo, che diceva
 * «Devi 123 € a Alessio» (cifra d'esempio: → ADR-0067). Qui perché
 * una regola di lingua italiana non è di nessuna pagina in particolare.
 */
export function aTo(name: string): string {
  return /^[aeiouàèéìòù]/i.test(name.trim()) ? 'ad' : 'a'
}

/**
 * Il «di cui» del saldo: «di cui 200 € di mutuo di settembre».
 *
 * La finestra è **il mese**, e la frase lo nomina: così il numero non pretende
 * di essere una fetta esatta del saldo, che è cumulativo e che nessun rimborso
 * imputa a una voce piuttosto che a un'altra. Se non vi saldate da tre mesi,
 * dentro il saldo di mutuo ce n'è di più — e la frase resta vera lo stesso,
 * perché parla di settembre. → ADR-0081
 *
 * Quando la rata tira dalla parte opposta al saldo — l'altra persona l'ha
 * anticipata questo mese, ma nel complesso è lei a doverti — «di cui»
 * mentirebbe: quel numero non è dentro il totale, lo abbassa. La seconda frase
 * esiste per quel caso, ed è l'unica ragione per cui questa funzione non è una
 * interpolazione scritta sul posto.
 */
export function diCuiLabel(opts: {
  /** Quanto la rata sposta il saldo, già girato dal punto di vista di chi guarda. */
  delta: number
  /** Il saldo, dallo stesso punto di vista. */
  balance: number
  /** Come si chiama la rata: la categoria collegata al progetto. */
  label: string
  /** Il mese di cui si parla, per esteso. */
  month: string
  /** Come si scrive un importo: il formattatore lo passa chi chiama. */
  format: (value: number) => string
}): string | null {
  const cifra = opts.format(Math.abs(opts.delta))
  const nome = `${opts.label.toLocaleLowerCase('it-IT')} di ${opts.month.toLocaleLowerCase('it-IT')}`
  if (opts.delta === 0) return null
  const concorde = opts.balance === 0 || (opts.delta > 0) === (opts.balance > 0)
  return concorde ? `di cui ${cifra} di ${nome}` : `${cifra} di ${nome} tirano dall'altra parte`
}
