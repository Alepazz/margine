# ADR-0035: Il confronto col mese scorso si fa a pari giorni

**Status:** accepted · **Date:** 2026-08-21

## Context

Nel Riepilogo c'erano tre confronti: contro la media storica, contro i tre mesi precedenti, e contro lo stesso mese dell'anno prima. Mancava quello più immediato — **contro il mese scorso** — e stava in fondo alla pagina la scheda che teneva gli altri due.

Alessio: «il confronto con il mese scorso invece lo vorrei mettere più in alto, in quanto è una statistica molto importante per il mese corrente».

Sul mese in corso quel confronto non si può fare fra un parziale e un mese intero: il 5 di agosto direbbe «−90% su luglio» a chiunque, e sarebbe una bugia consolatoria ogni primo del mese. È lo stesso problema per cui l'ADR-0011 confronta la **proiezione** con la media invece del parziale.

Le due strade erano quindi due. Confrontare la proiezione di agosto con luglio intero, coerente con come si tratta la media. Oppure tagliare anche luglio agli stessi giorni trascorsi.

## Decision

**A pari giorni**: i primi *D* giorni del mese scelto contro i primi *D* del precedente, dove *D* sono i giorni trascorsi se il mese è quello in corso, e il mese intero altrimenti.

La ragione della scelta è che non ha una stima dentro. La proiezione è un numero che l'app calcola e che può sbagliare — è una divisione lineare della parte variabile — e metterlo nel confronto più importante della pagina significa che quando il numero sorprende non si sa se è cambiata la spesa o se è la stima che tira. «Dal primo al ventuno di agosto [cifra rimossa], dal primo al ventuno di luglio [cifra rimossa]» sono invece due somme, entrambe vere.

E ha una proprietà che la rende gratis: **a mese chiuso diventa da sé il confronto fra due mesi interi**, senza cambiare metodo, perché *D* arriva a coprire tutto il mese. Non esistono due modalità da tenere allineate.

Due casi limite, gestiti nella funzione e visibili nell'etichetta: il mese precedente che non c'è nei dati (lo scostamento relativo è `null`, come in tutte le altre funzioni di confronto), e trentuno giorni contro un mese che ne ha trenta — che è il mese intero, e l'etichetta lo dice invece di scrivere «primi 31 giorni» di un mese che ne ha 30.

La scheda «Confronti» sale subito sotto il numero grande, con tre piastrelle: contro il mese scorso, ultimi tre mesi, stesso mese dell'anno prima.

## Consequences

Il confronto più utile è il primo che si legge, e non dipende da una proiezione.

Convivono ora due metodi per il mese parziale: **la media si confronta con la proiezione** (ADR-0011, che resta accepted), **il mese scorso a pari giorni**. Non è un'incoerenza da sanare: contro la media non si può tagliare, perché la media è di mesi interi e non esiste «la media dei primi ventun giorni» senza ricalcolarla per ogni giorno del mese. Contro un mese solo il taglio è banale, quindi si fa. Ma è una differenza che va detta a chi legge, e la scheda la dice in una riga quando il mese è in corso.

`compareSameDays` è l'unica funzione statistica che riceve **le spese** invece della serie mensile già aggregata: per tagliare a un giorno servono le date, che nella serie non ci sono più. È il motivo per cui non somiglia alle sue vicine.

Il costo: scorre l'elenco delle spese due volte per calcolarla, mentre gli altri confronti leggono la serie. Su 1255 voci non si misura.
