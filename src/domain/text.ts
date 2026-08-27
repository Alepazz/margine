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
 * «Devi [cifra rimossa] a Alessio». Qui perché una regola di lingua italiana non è di
 * nessuna pagina in particolare.
 */
export function aTo(name: string): string {
  return /^[aeiouàèéìòù]/i.test(name.trim()) ? 'ad' : 'a'
}
