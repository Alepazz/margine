# ADR-0004: L'import delle spese sta fuori dall'app, in una sessione assistita

**Status:** accepted · **Date:** 2026-08-19

## Context

Le spese nascono su Tricount, dove restano perché servono a dividere i conti con Federica. Margine è il cruscotto che le legge, non il posto dove si inseriscono: reinserirle a mano vorrebbe dire fare due volte lo stesso lavoro.

Con la riscrittura dell'app da parte di bunq (v8.0), Tricount ha **rimosso** l'export CSV/PDF (era una feature Premium, non è stata resa gratuita) e la web app `app.tricount.com` non esiste più. L'export ufficiale oggi si ottiene solo scrivendo a `support@bunq.com`. Esistono exporter di terze parti che leggono i dati dal link di condivisione, da verificare sui tricount reali.

## Decision

L'import è **mensile e assistito**, fuori dall'app: una volta al mese i dati (export di terze parti se funziona, altrimenti screenshot) vengono normalizzati in una sessione Claude Code, validati e committati. L'app **non ha inserimento manuale** delle spese.

Il flusso è codificato in `scripts/`: i file preparati vanno in `data/incoming/`, `npm run import` fonde nel master assegnando id deterministici (data + hash di titolo, importo e origine), valida e ripubblica cifrato. La validazione è quella che rende sicuro il giro: se le quote non sommano all'importo, se una spesa di vacanza non ha il viaggio, se una categoria non esiste, lo si vede prima di cifrare.

## Consequences

Questa è la decisione che rende possibile tutto il resto: se l'app non deve scrivere per funzionare, non serve un backend (ADR-0002) e i dati possono essere un file cifrato (ADR-0003).

In cambio, i dati sono freschi al mese, non al giorno: per un cruscotto di andamenti va bene, per «quanto ho speso stamattina» no. E dipende da una sessione manuale: se salta un mese, l'app mostra un buco (visibile, perché i mesi vuoti contano nella media).

L'id deterministico serve alle annotazioni 730 (ADR-0005): senza, rilanciare un import creerebbe doppioni e le note resterebbero attaccate a spese fantasma.
