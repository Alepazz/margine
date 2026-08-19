# ADR-0010: Le vacanze restano fuori dalle statistiche mensili

**Status:** accepted · **Date:** 2026-08-19

## Context

Il tricount delle vacanze contiene, per un solo mese, cifre che valgono quanto due mesi di spesa ordinaria: un viaggio da 3.000 € in agosto rende agosto «fuori media» e, di riflesso, rende «sotto media» tutti gli altri mesi. Se le vacanze entrano nelle medie, la domanda «questo mese sto spendendo più del solito?» non ha più una risposta utile.

Escluderle del tutto però nasconderebbe soldi realmente spesi, e la domanda «quanto mi costano le vacanze all'anno» è una di quelle che l'app deve saper rispondere.

## Decision

Le spese con origine `vacanze` sono **escluse per impostazione predefinita** da tutte le statistiche mensili (media, andamento, torta delle categorie, margine), con un interruttore «Senza vacanze / Con vacanze» sempre visibile per includerle.

Restano invece **sempre incluse** dove l'esclusione non avrebbe senso: la pagina Vacanze, la pagina Spese (che serve a cercare una voce precisa), la sezione 730 e la pagina del gatto.

## Consequences

La media mensile misura la vita ordinaria, che è quella su cui si può incidere, e il margine del mese non viene falsato da una settimana di viaggio. Il costo delle vacanze resta leggibile per anno e per luogo nella sua pagina.

In cambio, un numero in più da spiegare: il totale del mese nel Riepilogo può non coincidere con il totale della stessa finestra nella pagina Spese. L'interruttore è sempre a schermo proprio per rendere evidente quale delle due viste si sta guardando.
