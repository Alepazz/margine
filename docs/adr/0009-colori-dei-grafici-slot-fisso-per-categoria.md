# ADR-0009: Colori dei grafici: ordine validato e slot fisso per categoria

**Status:** accepted · **Date:** 2026-08-19

## Context

Le categorie sono undici e i grafici ne mostrano più di una alla volta. Due trappole note: assegnare i colori per posizione in classifica (così una categoria cambia tinta fra due mesi, e il lettore crede che sia cambiata la categoria), e generare tinte nuove quando le serie superano quelle disponibili (una nona tinta è indistinguibile da una esistente per chi non distingue rosso e verde).

## Decision

Otto tinte, in **ordine fisso**, validate con lo script del sistema di data visualization su entrambe le superfici reali dell'app (`#ffffff` in chiaro, `#161d23` in scuro): banda di luminosità, croma minima, separazione sotto daltonismo (protanopia/deuteranopia/tritanopia) e contrasto. Tutte le verifiche passano; in tema chiaro tre tinte stanno sotto 3:1 sulla carta, e per questo **ogni grafico porta sempre le etichette con i valori accanto** — il colore non è mai l'unico modo di leggerlo.

Ogni categoria ha uno `slot` (0-7) dichiarato in `config`: il colore appartiene alla categoria, non alla sua posizione. Le categorie senza slot confluiscono in un'unica fetta grigia «Altre voci» — mai una tinta generata al volo.

Due dettagli deliberati: nelle **barre impilate** le serie sono ordinate per slot, non per importo, perché i segmenti si toccano e l'ordine degli slot è quello su cui la separazione è stata verificata; nella **torta** l'ordine resta per grandezza (si legge meglio), e la separazione è garantita dal distacco di 2px fra le fette più dalle etichette con i valori.

L'ottavo slot è il rosso e va a «svago», che fa fette piccole: in un'app di spese una torta rossa somiglia a un allarme, e «viaggi» — che domina i grafici delle vacanze — prende il viola.

## Consequences

Una categoria ha lo stesso colore in ogni grafico e in ogni mese, e un filtro che cambia le categorie a schermo non ricolora quelle che restano. I grafici restano leggibili in stampa, in bianco e nero e sotto daltonismo.

In cambio: **non si riordinano i colori a occhio**. Cambiare l'ordine delle tinte o assegnarne una nona significa rifare la validazione con `scripts/validate_palette.js` del sistema di data visualization; farlo «perché sta meglio» rompe una garanzia che non si vede guardando lo schermo.
