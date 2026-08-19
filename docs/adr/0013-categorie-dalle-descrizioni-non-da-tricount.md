# ADR-0013: Le categorie si ricavano dalle descrizioni, non dal campo di Tricount

**Status:** accepted · **Date:** 2026-08-19

## Context

Gli export di Tricount contengono un campo `category`. Sembra la fonte naturale per la categoria di Margine, e userebbe una classificazione già fatta a mano invece di indovinarla.

Sui 1253 movimenti veri quel campo è inservibile: `OTHER` 386 volte e `UNCATEGORIZED` 132, cioè **il 41% delle voci non è classificato**. Il resto usa otto etichette generiche di Tricount (`FOOD_AND_DRINK` 280, `GROCERIES` 191, `ENTERTAINMENT` 97, …) che non distinguono le cose su cui l'app deve rispondere: `FOOD_AND_DRINK` mette insieme la spesa al supermercato e la pizzeria, `OTHER` contiene le crocchette del gatto, la colf e l'affitto. Nei cinque tricount delle vacanze la classificazione non è mai stata fatta del tutto.

Le descrizioni, invece, sono ricche e regolari: «Spesa Gigante» 85 volte, «Fattura Tim» 21, «Crocchette Gian», «Arcaplanet», «Psicologo», «Affitto Marzo».

## Decision

La categoria si ricava dalla **descrizione**, con una tabella di espressioni regolari in `scripts/from-tricount.mjs`: la prima che combacia vince, quindi l'ordine delle regole è parte della logica e non un dettaglio. Il campo `category` di Tricount **non viene letto**; è servito solo, a mano e una volta, per disambiguare una ventina di descrizioni oscure durante la stesura delle regole.

L'ordine risolve le ambiguità reali dei dati, e sono queste a dettarlo: il gatto viene prima del cibo, altrimenti «Cibo Gian» diventa spesa alimentare; i trasporti e il cibo vengono prima dello sport, altrimenti «Benzina sci» diventa sport e «Pranzo sci» pure.

Quello che nessuna regola prende finisce in `altro` e viene **stampato a fine conversione**, voce per voce. Non è un caso limite da ignorare: è la lista di lavoro del mese dopo. Sul primo import sono 20 voci su 1253 (1,6%).

## Consequences

La classificazione è riproducibile e migliora: rilanciare la conversione sugli stessi export dà lo stesso risultato, e ogni correzione diventa una regola che vale anche per i mesi futuri. La tabella è leggibile in un posto solo, il che rende ovvio dove intervenire quando una voce finisce nel posto sbagliato.

In cambio la tabella è codice che va manutenuto, e cresce con i nomi propri: «Ippo», «Alto e Savio», «Pozzo» sono locali, non parole di dizionario, e chi legge le regole fra un anno non saprà perché ci sono. Le regole basate su nomi di posti sono raggruppate in fondo con questo scopo dichiarato.

Il rischio residuo è il silenzio: una descrizione nuova che *combacia per caso* con una regola esistente viene classificata male senza comparire in nessun elenco. Il totale che riconcilia con Tricount non lo intercetta, perché l'importo è giusto: sbagliata è solo la categoria. L'unico presidio è guardare le categorie dopo un import, non solo i totali.
