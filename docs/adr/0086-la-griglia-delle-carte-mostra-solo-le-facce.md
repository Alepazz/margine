# ADR-0086: La griglia delle carte mostra solo le facce

**Status:** accepted · **Date:** 2026-09-02

## Context

La prima versione del mazzo scriveva sotto ogni tessera il nome e il tipo di codice («Conad» / «EAN-13»), per un caso preciso: una faccia è un ritaglio di schermata, può venire tagliata male o mancare, e una tessera che non si identifica è inutile in mano alla cassa. Alessio, il 02/09/2026, guardando le sue otto carte vere: «l'elenco delle carte deve avere solo le immagini niente Conad EAN-13, occupano solo spazio quelle due righe».

Aveva ragione sui dati veri: le facce sono le **insegne** dei negozi, ritagliate dalla griglia di Klarna, e un'insegna si riconosce prima di leggerla. Le due righe ripetevano ciò che l'occhio aveva già capito, e costavano un terzo dell'altezza di ogni riga della griglia.

## Decision

La griglia è di **sole facce**. Il nome entra **dentro** la faccia solo quando l'immagine manca — una tessera senza immagine è un rettangolo di colore, e un rettangolo di colore da solo non dice di chi è. Il tipo di codice non si mostra in griglia: sta nella scheda dei dettagli della tessera aperta. Per chi legge con la voce il collegamento porta nome e tipo in `aria-label`, e l'immagine ha `alt` vuoto per non farlo leggere due volte.

## Consequences

- Una faccia che **non identifica** il negozio (una foto tagliata male, aggiunta a mano) non ha più un nome accanto. La cura è non mettere l'immagine: allora il nome compare dentro la faccia colorata.
- La griglia è più densa: lo spazio fra le tessere è uguale nei due sensi (12px), non c'è più il vuoto delle didascalie.
- Il formato del codice si scopre solo aprendo la tessera. Non serve prima: alla cassa non lo si sceglie.
