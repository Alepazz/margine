# ADR-0008: Importi in euro nel file, aritmetica in centesimi

**Status:** accepted · **Date:** 2026-08-19

## Context

I numeri di Margine devono riconciliare con quelli di Tricount **al centesimo**: è il controllo che rende affidabile l'import mensile (ADR-0004). In virgola mobile `0.1 + 0.2` fa `0.30000000000000004`, e su qualche centinaio di spese l'errore diventa visibile in un totale.

Due strade: tenere tutto in centesimi interi anche nel file JSON, o tenere gli euro nel file e convertire nei calcoli. La prima è più sicura ma rende il file illeggibile a occhio — e quel file va riletto e validato a mano ogni mese, durante l'import.

## Decision

Nel JSON gli importi stanno **in euro con due decimali** (`59.10`), leggibili durante la sessione di import. Ogni somma passa dalle funzioni di `src/domain/money.ts`, che convertono in **centesimi interi**, sommano e riconvertono. Nessun `+` diretto su importi nel resto del codice.

La divisione a metà usa `splitHalf()`, che garantisce per costruzione che le due quote sommino esattamente all'originale: il centesimo dispari va alla prima metà, per convenzione a chi ha pagato.

## Consequences

Il file resta leggibile e verificabile a occhio, e i totali sono esatti. Il vincolo «le quote sommano all'importo» è controllato dalla validazione a ogni import, quindi un errore di arrotondamento non entra nei dati.

In cambio, una disciplina da rispettare: chi somma importi con `reduce((a, b) => a + b)` invece di `sumEuro()` reintroduce l'errore, e lo fa in modo silenzioso — nessun test lo prende se gli importi di prova sono numeri tondi. Per questo i test di `money.test.ts` usano di proposito importi con i centesimi.
