# ADR-0032: La divisione si dichiara dicendo chi partecipa

**Status:** accepted · **Date:** 2026-08-20

## Context

ADR-0018 aveva stabilito che la divisione di una spesa si scegliesse con quattro pulsanti — «Metà», «Tutta mia», «Tutta sua», «A mano» — invece di comporre due numeri che devono sommare all'importo. La ragione era buona e resta valida: in due anni di dati esistono solo tre divisioni reali, e chiedere due importi a mano per una spesa divisa a metà è chiedere un calcolo per una cosa ovvia.

Alessio, dopo averla usata: «la spesa si divide tra le persone del Tricount, ad oggi solo me e Fede quindi queste sono le uniche opzioni possibili — di default l'utente selezionato è quello che ha pagato e che sta aggiungendo la spesa e può assegnarla a se stesso o entrambi», con lo screenshot di Tricount: due righe con una spunta e, accanto a ciascuna, quanto tocca a quella persona.

È lo stesso insieme di possibilità, detto in un modo diverso — e il modo diverso porta due cose che i pulsanti non hanno.

La prima: **i tre preset sono le tre combinazioni di due spunte.** «Metà» è entrambe, «tutta mia» è una, «tutta sua» è l'altra. Nominare le combinazioni è un'astrazione in mezzo che chiede di essere tradotta ogni volta; le spunte sono la cosa stessa.

La seconda, che è quella che conta: le spunte hanno posto per **il numero**. «Metà» non dice quanto, mentre «☑ Alessio 6,28 €» sì — ed è l'importo che si vuole vedere prima di salvare, perché è quello che poi va confrontato con Tricount.

## Decision

Due righe, una per persona del tricount: spunta, emoji e nome — con «(tu)» accanto a chi sta guardando — e a destra quanto le tocca, che si aggiorna mentre si scrive l'importo. Chi non partecipa mostra «—» e non «0,00 €»: zero è un importo, il trattino è un'assenza.

Accanto all'etichetta c'è una tendina con **«In parti uguali»** e **«A mano»**. In modalità a mano le due righe diventano due campi importo, e in un tricount di vacanza compare anche la quota di chi era con voi.

Le spunte **non sono uno stato a parte**: sono la lettura del preset, e il preset resta la fonte di verità. Quindi non esiste uno stato in cui le due rappresentazioni divergono, e la combinazione impossibile — nessuno dei due partecipa — non è respinta da una validazione: semplicemente non è raggiungibile, perché togliere la spunta all'unico che partecipa non fa niente. È preferibile a un errore da leggere: quella spesa qualcuno l'ha pagata per qualcuno, sempre.

Il pagante resta un controllo suo, e di default è chi sta guardando. Chi ha pagato e come si divide sono due domande diverse, e la seconda non risponde alla prima. → ADR-0028

## Consequences

Prima di salvare si vede il numero che finirà nel saldo, che è il controllo che si vuole fare in quel momento.

Il modello sotto **non cambia di una riga**: `splitFor`, `presetOf`, `sharesFor` e la regola del centesimo dispari sono esattamente quelle di prima (→ ADR-0023). Cambia solo come si dice al modulo quale dei quattro casi è, quindi tutti i test sulla divisione valgono ancora senza toccarli — ed è la ragione per cui questa modifica è stata sicura.

**Il limite accettato**: le due persone sono cablate a due. «Ad oggi solo me e Fede» era la premessa di Alessio, e le due chiavi fisse di `shares` sono nel modello dal primo giorno; un tricount con quattro persone non è una riga in più in questo componente, è un altro modello di dati. La quota di terzi anonima (→ ADR-0012) copre il caso «in vacanza c'era altra gente» senza aprire quella porta.

**ADR-0018 resta accepted**: il perché — non chiedere due numeri quando la divisione è ovvia — è la ragione per cui anche questa versione ha «in parti uguali» come default e «a mano» come eccezione. Questo ADR sostituisce solo il paragrafo sui quattro pulsanti.
