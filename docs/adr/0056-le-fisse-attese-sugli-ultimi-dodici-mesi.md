# ADR-0056: Le fisse attese si stimano sugli ultimi dodici mesi

**Status:** accepted · **Date:** 2026-08-27

## Context

Lo spendibile toglie dalle entrate le **fisse attese**, che `projectMonth` calcola come `max(fisse già arrivate, media storica delle fisse)` (→ ADR-0015). Quella media era su tutta la storia disponibile, ed è l'unico ingrediente dello spendibile che non è un fatto ma una stima.

Guardando i dati veri, la storia disponibile non è omogenea. I tricount partono da ottobre 2024, ma l'affitto compare da dicembre: ottobre fa **79 €** di fisse e novembre **3,60 €**. Due mesi in cui la vita non era diversa — era diverso cosa veniva registrato.

```
media delle fisse su tutti i 22 mesi   487,61 €
media delle fisse sugli ultimi 12      539,03 €
media delle fisse sugli ultimi 6       547,00 €
```

Cinquantun euro di scarto, sempre nella stessa direzione: la media lunga sottostima ciò che sta per uscire dal conto. E siccome la barra nuova disegna le fisse ancora attese (→ ADR-0057), lo scarto non è più solo una cifra in una riga: è la lunghezza di un pezzo di barra.

C'è anche una ragione che non dipende dai dati di partenza: **l'affitto cambia**. La quota di Alessio è oscillata fra 411 € e 476,53 € in venti mesi. Una media su tutta la storia insegue un aumento con anni di ritardo.

## Decision

Le fisse attese si stimano sugli **ultimi dodici mesi chiusi**: `averageMonthly(series, { excludeMonth, until, lastN: 12 })`. È l'unica media dell'app con una finestra mobile, e la sola che alimenta un numero *previsionale*.

Tutte le altre restano su tutta la storia, e non è un'incoerenza: rispondono a una domanda diversa. «Sto spendendo più del solito?» vuole tutto il solito che si ha; «quanto mi aspetta a fine mese?» vuole com'è la vita adesso. Dodici mesi e non sei perché le bollette di gas e luce arrivano ogni due mesi: su sei, una in più o in meno sposta la stima di decine di euro, e la stima diventa più nervosa del fenomeno che descrive.

La scheda «Fisse contro variabili» mostra **questa** media, non quella lunga. Due numeri diversi per la stessa cosa sulla stessa pagina sarebbero solo da spiegare.

## Consequences

Lo spendibile cala di circa 51 € rispetto a prima, e la cifra che dà è quella che aspetta davvero a fine mese. I mesi passati **non si muovono**: a mese chiuso `expectedFixed` è `month.fixed` e la finestra non entra nel conto (→ ADR-0015), quindi la storia resta ferma al centesimo.

In cambio, la stima diventa più reattiva anche verso il basso: chiuso un abbonamento, la media lo dimentica in dodici mesi invece che in ventidue. Ed è più esposta a un mese anomalo — un conguaglio, un'assicurazione annuale — che ora pesa un dodicesimo invece di un ventiduesimo. È lo stesso limite che ADR-0015 aveva già dichiarato, con il peso spostato di un gradino.

Il numero **12** vive in `Home.tsx`, non in un token del dominio: è una scelta di quella pagina su quale storia guardare, e `averageMonthly` resta una funzione che sa fare le medie senza sapere perché.
