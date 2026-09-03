# ADR-0092: Il progetto si chiama Giano

**Status:** accepted · **Date:** 2026-09-03

## Context

L'app è nata per rispondere a una domanda — quanto margine resta questo mese — e il nome diceva quella cosa. Poi ha imparato i prezzi al supermercato (ADR-0041), le carte fedeltà (ADR-0082), la lista della spesa (ADR-0088), i viaggi, le voci da 730; e sono in arrivo il multiutente e il blocco delle sezioni. «Margine» è diventato il nome di **una scheda** dentro un'app che fa altre sei cose, e continuare a chiamare tutto col nome del numero che mostra una schermata è il genere di disallineamento che si paga in confusione quando arriva qualcuno da fuori — cioè adesso, che Federica ha accesso e degli amici l'avranno.

Due vincoli tecnici escludono un rename fatto con un cerca-e-sostituisci.

Il primo è il **suffisso dei commit**. La campanella delle novità distingue le scritture dall'interfaccia da tutto il resto della storia leggendo il suffisso ` (da Margine)` (ADR-0051), e due anni di commit lo portano addosso. Il repo è pubblico e la sua storia non si riscrive per un cambio di nome (ADR-0068 l'ha fatto una volta, per una ragione ben più grave). Sostituire il suffisso renderebbe muta la campanella su tutto il passato **senza un errore**.

Il secondo è il **prefisso di `localStorage`**. Quindici chiavi si chiamano `margine.*`, e fra loro c'è `margine.outbox.v3`, che è l'unico posto dove vivono le modifiche non ancora committate (ADR-0070). Rinominare quel prefisso significa, su ogni dispositivo, buttare la coda in volo, i segni della campanella, l'identità scelta e il token: una perdita di dati silenziosa in cambio di niente.

## Decision

Il progetto si chiama **Giano**. È il dio romano delle porte, con due facce: una guarda avanti e una guarda indietro — che è letteralmente ciò che mostra il Riepilogo, lo storico da una parte e la proiezione dall'altra. È memorabile perché «Giano bifronte» è un'espressione già in uso, e **gennaio** prende il nome da lui, che per un'app il cui perno è il mese è una coincidenza troppo buona per lasciarla.

Le alternative scartate, dopo una ricognizione sui domini fatta il 03/09/2026: **Cambusa**, **Scorta**, **Kilter**, **Tote**, **Penati**, **Cerere** e una ventina d'altre — tutte accettabili, nessuna con la doppia lettura del passato e del futuro. Scartati per ragioni concrete: **Sidecar** (dominio preso, ed è il nome di un pattern Kubernetes), **Jarvis** (dominio preso, e Jarvis.ai si è rinominata Jasper nel 2022 dopo una contestazione di marchio Marvel), **ClauDio** (`claud.io` sarebbe libero, ma «Claude» è un marchio Anthropic e legherebbe l'identità dell'app a uno strumento che fra due anni potrebbe non essere quello), **Domus** (occupato su `.com`, `.it`, `.app` e `.casa`).

Il rename **aggiunge** e non sostituisce, nei due punti che contano:

- `APP_COMMIT_SUFFIX` diventa ` (da Giano)`, e accanto nasce `LEGACY_COMMIT_SUFFIXES` con dentro ` (da Margine)`. A leggere ci pensa `appCommitSummary()`, un posto solo, così chi legge non deve sapere quanti nomi ha avuto l'app. Un test in `changes.test.ts` pretende che un commit del vecchio nome resti una novità e che il riassunto esca pulito da entrambi.
- Il prefisso `margine.` di `localStorage` **non si tocca**. È invisibile all'utente e la sua stabilità vale più della coerenza estetica.

Cambia invece tutto ciò che si vede: il marchio in testata, nel Gate e nell'IdentityGate, il `<title>`, il manifest, il nome del pacchetto, il README, e i messaggi d'errore che nominano l'app.

## Consequences

Chi apre il repo, il sito o il telefono trova un nome che copre tutto quello che l'app fa, e la scheda «margine» torna a essere una scheda. Il workspace Linear del progetto si chiama Giano, con prefisso `GIA`.

Il costo è un'asimmetria permanente da ricordare: **il nome che l'app scrive nei commit e il nome che sa leggere sono due insiemi diversi**, e il secondo cresce a ogni rename. Un domani, un terzo nome si aggiunge alla lista dei legacy — non si scambia. Chi cerca `margine` nel codice continuerà a trovarlo in quindici chiavi di `localStorage` e in un suffisso legacy: sono i due posti in cui è giusto che resti, e il commento accanto a ciascuno dice perché.

Resta un debito dichiarato: `data-example/` e i fixture dei test non nominano l'app, quindi non serve toccarli; ma la storia in `CLAUDE.md` continua a raccontare i mesi in cui l'app si chiamava Margine, e va letta come storia — non come un refuso da correggere.
