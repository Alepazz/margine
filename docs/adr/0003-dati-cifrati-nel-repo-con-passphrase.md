# ADR-0003: Dati cifrati nel repo, sbloccati con una passphrase

**Status:** accepted · **Date:** 2026-08-19

## Context

I dati sono l'estratto completo delle spese di due persone: importi, descrizioni, date, abitudini. L'app è un sito statico (ADR-0002), quindi i dati devono stare in un file servito pubblicamente: l'URL di GitHub Pages è raggiungibile da chiunque lo conosca, anche con repo privato. «URL non indovinabile» non è una protezione: basta che il link finisca in un log, in una cronologia condivisa o in un messaggio.

Non esiste un server dove mettere un controllo d'accesso, e aggiungerne uno vorrebbe dire rinunciare a ADR-0002.

## Decision

I dati vivono nel repo **cifrati**: `public/data/expenses.json.enc` e `config.json.enc`, AES-256-GCM con chiave derivata dalla passphrase via PBKDF2-SHA256 a 600.000 iterazioni (raccomandazione OWASP 2026), tutto con WebCrypto — nessuna libreria di crittografia.

Il formato è un envelope autodescrittivo (`src/data/envelope.ts`): dentro ci sono salt, numero di iterazioni e IV, così un file scritto oggi resta apribile se domani si alzano le iterazioni. I due file condividono lo stesso salt, così la chiave si deriva una volta per sessione invece di due.

Il master in chiaro vive solo sul Mac, in `data/`, escluso da git. La passphrase sta in `.secrets/passphrase`, anch'esso fuori da git.

L'app offre «Ricorda su questo dispositivo», che salva la passphrase in `localStorage`. È una scelta consapevole: **la protezione scende al livello del dispositivo**, in cambio di un'app che dal telefono si apre senza digitare niente. Chi apre l'URL su un dispositivo che non ha mai sbloccato vede solo la schermata di sblocco.

## Consequences

Il repo può stare anche pubblico: senza passphrase i file sono rumore, e chi trova l'URL vede un'app vuota. Non c'è nessun servizio di terze parti nel giro dei dati.

In cambio: **se si perdono insieme la passphrase e il master locale, i dati non sono recuperabili** — non esiste un «recupera password». Mitigazione: la passphrase va nel password manager. Chi ruba il telefono sbloccato con «ricorda» attivo vede le spese: mitigazione, il blocco schermo del telefono, e il pulsante «Dimentica passphrase e blocca» nelle impostazioni.

Lo sblocco costa mezzo secondo di calcolo su telefono (600.000 iterazioni): è il prezzo, pagato una volta per sessione.
