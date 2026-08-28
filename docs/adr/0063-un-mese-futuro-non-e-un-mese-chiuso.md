# ADR-0063: Un mese futuro non è un mese chiuso

**Status:** accepted · **Date:** 2026-08-27

## Context

Alessio, guardando la scheda di un mese futuro che ha già delle voci: «"mese chiuso.." appare anche per i mesi futuri che hanno delle spese, questo non va bene».

La causa sta in tre righe che sembravano ovvie:

```ts
export function elapsedDaysInMonth(month: MonthKey, today: string): number {
  if (monthKeyOf(today) !== month) return daysInMonth(month)
  return Math.min(dayOf(today), daysInMonth(month))
}
```

La condizione è «se non è il mese corrente, è tutto trascorso». Vera per il passato, **falsa per il futuro** — e nessuno l'aveva notato perché finché i dati arrivano solo fino a oggi un mese futuro non esiste nella serie. Ne è bastato uno: una spesa di pochi euro datata 15 settembre 2026 per sbaglio, la stessa che in ADR-0055 apriva un mese fantasma nelle medie.

Da lì `projectMonth` concludeva `elapsedDays >= totalDays` e restituiva `method: 'chiuso'`, e la scheda annunciava «Mese chiuso: il numero è definitivo» di un mese non ancora cominciato.

C'era anche una trappola più a valle, che la prima riparazione avrebbe aperto: mettendo semplicemente `elapsed = 0` per il futuro, la proiezione delle variabili — `(month.variable / elapsedDays) * totalDays` — sarebbe diventata `Infinity`, e con lei il numero grande.

## Decision

`elapsedDaysInMonth` distingue **tre** casi invece di due: mese passato (tutto trascorso), mese in corso (fino a oggi), mese futuro (**zero**).

`Projection.method` guadagna un terzo valore, `futuro`, accanto a `chiuso` e `stimato`. Un mese non ancora cominciato non si proietta: da zero giorni non si estende nessun ritmo. Le poche voci che può già avere — l'affitto pagato in anticipo, o una data sbagliata — sono **fatti**, non un ritmo, e restano quelle. Le fisse attese invece si sanno già: sono la media, come sempre.

A schermo il numero grande dice «Il mese non è ancora cominciato», e la scheda della proiezione lo stesso. Nessuna tacca sulla barra: la tacca risponde a «dove arrivi a questo ritmo», e un ritmo che non è partito non porta da nessuna parte.

## Consequences

La scheda di un mese futuro smette di mentire su cosa sia quel numero. Continua a mostrarlo — la spesa esiste, ed è guardandola che ci si accorge del refuso, esattamente come deciso in ADR-0055 per la striscia dei mesi.

Il terzo valore di `method` va gestito dovunque se ne leggano due, e i tipi **non aiutano**: `method === 'stimato'` resta valido con tre valori, quindi il compilatore non segnala i posti da rivedere. Sono due — il numero grande e la scheda della proiezione — ed è per questo che stanno scritti qui.

Questa è la terza volta oggi che lo stesso refuso di data produce un difetto diverso: prima un mese fantasma nelle medie (→ ADR-0055), poi «il mese più leggero: settembre 2026», ora «mese chiuso». Il dato sbagliato è uno solo e sarà corretto in un minuto, ma ogni volta ha scoperto un posto che dava per scontato che i dati finissero oggi. Vale la pena tenerlo a mente come metodo: **una data nel futuro è il caso di prova più economico che questi dati permettano**.
