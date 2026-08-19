# ADR-0001: Registrare le decisioni con gli ADR

**Status:** accepted · **Date:** 2026-08-19

## Context

Margine nasce da uno studio di fattibilità in cui sono state prese in poche ore una decina di decisioni non ovvie: dove sta l'hosting, come si cifrano i dati, chi scrive nel repo, come si dividono le quote. Fra sei mesi, davanti a una riga di codice, la domanda sarà «perché diavolo l'abbiamo fatto così?», e la risposta oggi vive solo in una conversazione.

## Decision

Le decisioni significative si registrano come ADR in stile Nygard in `docs/adr/`, numerati progressivamente, dal template in `docs/adr-template.md`. Un ADR, una decisione. Un ADR accettato non si riscrive: se una decisione nuova ne cambia una vecchia, si scrive un ADR nuovo e del vecchio si cambia solo lo stato in `superseded by ADR-NNNN`.

L'ADR si scrive nello stesso commit del codice che prende la decisione: rimandarlo significa non scriverlo più.

## Consequences

Chi arriva sul repo trova il perché accanto al codice, e non deve ricostruirlo dai diff. In cambio, ogni scelta strutturale costa mezza pagina di prosa in più — che è il prezzo per non riaprire la stessa discussione due volte.

Il registro è storia, non stato corrente: un ADR può descrivere una situazione non più vera, e va letto insieme al suo stato.
