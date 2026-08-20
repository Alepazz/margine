# ADR-0029: La tavolozza resta a otto tinte, e una categoria nuova nasce senza colore

**Status:** accepted · **Date:** 2026-08-20

## Context

ADR-0009 ha fissato otto tinte categoriali in ordine validato — banda di luminosità, croma, separazione per daltonismo, contrasto sulle due superfici reali dell'app — e la regola che il colore appartiene alla categoria e non alla sua posizione in classifica. Le categorie senza slot confluiscono in un'unica fetta grigia, «Altre voci».

Finché le categorie stavano in un file, il numero otto era una constatazione: erano nove e le otto che spendono più avevano uno slot. Da quando si creano dall'app (→ ADR-0024) diventa una domanda vera: **che colore prende la nona categoria?**

E c'è di più. `buildCategoryLookup` aveva un ripiego che nessuno aveva mai eseguito: una categoria senza `slot` dichiarato prendeva lo slot corrispondente alla propria **posizione nell'elenco**, se minore di otto. Con la tassonomia di allora era codice morto, perché le prime otto avevano tutte uno slot dichiarato. Con le categorie modificabili non lo è più: basta creare una categoria che finisca fra le prime otto perché prenda in silenzio la tinta di un'altra — due categorie identiche in ogni grafico, e nel grafico a barre impilate due segmenti confinanti dello stesso colore.

L'alternativa da valutare era allargare la tavolozza a dieci o dodici tinte.

## Decision

La tavolozza resta a **otto**. Sopra le otto, le tinte categoriali smettono di essere distinguibili — la separazione fra coppie adiacenti scende sotto la soglia utile, e sotto daltonismo prima ancora. Non è una difficoltà di implementazione: è che una nona tinta *sembra* informazione e non lo è.

Una categoria creata dall'app **nasce senza slot**, e quindi senza colore proprio: confluisce in «Altre voci», che è la verità su di lei. Da Impostazioni le si può assegnare uno degli otto colori, e l'assegnazione è uno **scambio**: chi aveva quello slot prende quello che aveva lei, cioè quasi sempre nessuno. Il menù dice, per ogni colore, chi lo tiene adesso.

Il ripiego sulla posizione nell'elenco è **rimosso**: solo uno `slot` dichiarato dà un colore. C'è un test che verifica la cosa che conta, e non è che il ripiego non ci sia più — è che **nessuno slot appartenga a due categorie** dopo uno scambio.

## Consequences

Il numero di categorie e il numero di colori si separano: si possono avere venti categorie, e otto di esse hanno una tinta. Il grafico resta leggibile perché la fetta grigia raccoglie il resto, e chi vuole vedere una categoria «minore» le dà uno slot togliendolo a un'altra — una scelta esplicita, con la sua conseguenza scritta accanto.

Il costo è un attrito reale: dare un colore a una categoria nuova richiede di deciderne una da declassare. È l'attrito giusto, perché è la decisione che si sta effettivamente prendendo, e prima era nascosta.

ADR-0009 resta **accepted**: l'ordine delle tinte, il colore legato alla categoria e la fetta «Altre» valgono tutti. Questo ADR risponde a una domanda che allora non esisteva.

Se un giorno servissero davvero più di otto famiglie a colori, la strada non è allungare la rampa: sono i piccoli multipli — un grafico per famiglia — o una codifica composta. Quella sarebbe una decisione nuova.
