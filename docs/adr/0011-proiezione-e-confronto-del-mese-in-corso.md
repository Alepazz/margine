# ADR-0011: Come si proietta il mese in corso e con cosa si confronta

**Status:** accepted · **Date:** 2026-08-19

## Context

Il mese in corso è parziale, e questo rompe due cose in modo silenzioso.

La prima: confrontare il parziale con la media di mesi interi dice «vai benissimo» il 5 di ogni mese, con un bel segno verde. È un confronto formalmente corretto e concretamente falso.

La seconda: proiettare linearmente il totale (`speso / giorni_passati × giorni_totali`) sbaglia di molto, perché le spese fisse non si pagano un trentesimo al giorno. Il 2 del mese l'affitto è già stato addebitato e la proiezione lineare lo moltiplica per quindici; il 28 non è ancora arrivata una bolletta e la proiezione la ignora.

## Decision

**Proiezione a due componenti** (`projectMonth`): le fisse attese sono il maggiore fra quelle già addebitate nel mese e la media storica delle fisse (se non sono ancora arrivate, si assumono in arrivo); solo la parte variabile si proietta in proporzione ai giorni. Il risultato è la somma.

**Confronto con la media**: per un mese in corso si confronta la **proiezione**, non il parziale, e l'etichetta lo dice («sulla media (proiezione)»). Per un mese chiuso si confronta il totale.

La media storica **esclude sempre il mese in corso** e **conta i mesi vuoti**: un mese senza spese registrate abbassa la media, invece di scomparire dal denominatore.

## Consequences

Il semaforo del margine dice qualcosa di vero anche il 3 del mese, ed è il numero su cui si può decidere se rallentare. La proiezione delle fisse è robusta rispetto al giorno in cui cadono gli addebiti.

In cambio, due numeri che vanno spiegati e non indovinati: la proiezione non è una moltiplicazione (chi la ricalcolasse a mano otterrebbe un altro numero), e il confronto mostrato per il mese in corso non riguarda quanto è stato speso finora ma quanto si stima di spendere. Entrambe le cose sono scritte nell'interfaccia accanto ai numeri, non solo qui.
