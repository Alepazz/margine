# ADR-0006: Gli scontrini sono link a Google Drive, non file nel repo

**Status:** accepted · **Date:** 2026-08-19

## Context

Le spese segnate per il 730 hanno bisogno della foto dello scontrino, consultabile «tutta in un posto» quando si è dal commercialista.

Due strade possibili. La prima: caricare la foto dall'app, comprimerla e cifrarla nel browser con la stessa passphrase dei dati, e committarla nel repo — tutto in un posto, protetto come il resto, e consultabile in-app con un tap. La seconda: caricare la foto su Google Drive a mano e conservare nell'app soltanto il link.

## Decision

**Link a Google Drive**, campo `receiptLinks` sulla spesa. Scelta esplicita dell'utente, dopo aver considerato l'alternativa: preferisce che le foto restino consultabili anche fuori dall'app, in un posto che già usa e che non dipende da Margine.

Convenzione di archiviazione: una cartella per anno (`Drive → Scontrini 730 → <anno>`), promemoria scritto in `config.fiscal.driveFolderHint` e mostrato nell'app quando una spesa non ha ancora lo scontrino.

Le foto cifrate nel repo restano un possibile ADR futuro: i link già inseriti continuerebbero a valere, quindi il cambiamento sarebbe additivo.

## Consequences

Zero pensieri di spazio nel repo, foto raggiungibili anche da fuori l'app, nessun caricamento da gestire nel codice.

In cambio, tre cose. Primo: il giro è manuale — foto su Drive, copia link, incolla nell'app. Secondo: **la protezione della foto dipende dai permessi del link Drive**, non dalla cifratura di Margine; un link «chiunque può visualizzare» è aperto a chi lo possiede, quindi la raccomandazione è tenerli visibili solo al proprio account Google. Terzo: se un file viene spostato o cancellato su Drive, l'app conserva un link morto e non ha modo di accorgersene.
