# ADR-0070: Dalla coda escono solo le voci committate

**Status:** accepted · **Date:** 2026-08-28

## Context

Il flush fotografava la coda (`const entries = outboxRef.current.pending`), costruiva il commit, e alla riuscita faceva `persistOutbox({ pending: [], … })`.

`pending: []` azzera **la coda**, non le voci committate. Tutto ciò che entrava fra la fotografia e il commit — una finestra di uno a quattro secondi: lettura del file, decifratura, cifratura e cinque chiamate alla Git Data API — usciva dalla coda **senza essere mai stato scritto**. La sua `scheduleFlush` scattava 1,2 secondi dopo, trovava la coda vuota e dichiarava «tutto sincronizzato».

Non è un caso limite. Il modulo dei prezzi **non si chiude quando salva** (→ ADR-0044), quindi «due salvataggi a due secondi di distanza» è il flusso normale davanti allo scaffale, non l'eccezione; due spese al volo alla cassa fanno lo stesso.

Il caso peggiore è muto. Se il flush in volo toccava **solo** la configurazione e l'operazione nuova toccava i dati, `merged` è `undefined`, quindi `setDataset` non viene chiamato e **la spesa resta a schermo** pur non essendo più in coda né nel repo. Te ne accorgi al ricaricamento successivo, senza un modo di sapere quando è sparita.

Accanto c'era un secondo problema che rende il primo più probabile: `flush` è esposto **direttamente** come `syncNow`, quindi il pulsante in Impostazioni, la sincronizzazione dopo il salvataggio del token e il timer del debounce possono partire insieme, e due giri in parallelo leggono la stessa testa e costruiscono lo stesso commit.

## Decision

Dalla coda escono **le voci committate**, per `entryId`, e il resto resta in attesa:

```ts
const committed = new Set(entries.map((entry) => entry.entryId))
const remaining = outboxRef.current.pending.filter((entry) => !committed.has(entry.entryId))
```

Ciò che resta va **riapplicato sopra il dataset committato** (`applyOps(merged, remaining)`, e l'equivalente per la configurazione), altrimenti la spesa appena inserita sparirebbe da sotto gli occhi di chi l'ha scritta: `merged` è il remoto più le voci del commit, e non contiene quelle nuove.

`flush` diventa **un giro alla volta** — un `flushing` ref respinge il secondo chiamante — **e si ripete** finché la coda si svuota. Il ciclo si ferma appena la coda è vuota o appena un giro non ne fa uscire **nessuna delle voci che c'erano**: senza quel confronto un errore, che lascia ogni identità al suo posto, girerebbe per sempre. Il confronto è sulle **identità** e non sul numero, per la ragione che sta fra le conseguenze. (Questa frase diceva «appena un giro non l'ha accorciata», cioè esattamente la formulazione che le conseguenze qui sotto chiamano il difetto: corretta il 28/08/2026 senza cambiare la decisione, perché una sezione `Decision` che descrive l'alternativa scartata è un invito a rimetterla.)

L'alternativa scartata è bloccare gli inserimenti durante un flush. Sarebbe corretta e sbagliata: l'app si usa in piedi al supermercato, e un modulo che rifiuta di salvare per tre secondi mentre l'altro salvataggio vola è peggio del difetto che cura.

## Consequences

**Un inserimento durante un commit costa un commit in più**, non un dato perso: la voce nuova parte al giro dopo. Prima costava un dato perso e nessun commit.

**Il progresso si misura sulle identità, non sul numero, e la prima versione sbagliava proprio qui.** Scritta come «esci se la coda non si è accorciata» (`after >= before`), la ripetizione si fermava ogni volta che le voci arrivate durante il volo erano tante quante quelle committate — e siccome il debounce scatta 1,2 s dopo il **primo** salvataggio, il commit in volo porta di solito **una** operazione: bastava un salvataggio in mezzo perché la voce restasse in coda con `syncing` acceso e nessun timer armato. Riprodotto con un simulatore a orologio finto, non dedotto. Ora la domanda è «è uscita almeno una delle voci che c'erano prima?», che è quella giusta, e continua a fermarsi su un errore perché un errore lascia ogni identità al suo posto.

**Il chiamante respinto dal guard non esce muto.** Chi premeva «Salva adesso» durante un giro in corso non vedeva niente: è la forma di difetto di ADR-0043 — un pulsante che non dichiara di non aver fatto nulla — quindi il ramo dichiara `syncing`, che è la verità.

**Lo stato `syncing` può restare acceso dopo un commit riuscito**, quando la coda non è vuota — ed è vero: c'è ancora qualcosa in volo. Il contatore dice quante, come prima.

**`entryId` è diventato portante per la correttezza, e ha dovuto reggerlo.** Prima la coda si azzerava, quindi l'id serviva solo a leggere una voce a occhio; ora è la chiave con cui si decide chi esce. Il contatore vive **per scheda**, quindi due schede dello stesso browser alla loro prima voce nello stesso millisecondo producevano lo stesso id, e il salvataggio dell'una avrebbe tolto dalla coda la voce dell'altra: lo stesso difetto, rientrato dalla finestra. Ora l'id porta tre byte casuali. Serviva che due azioni umane cadessero nello stesso millisecondo in due schede, quindi non è mai successo — ma escluderlo costa tre byte e non escluderlo costa una spesa.

**Il difetto non è coperto da un test**, e va detto invece di lasciarlo credere. Provarlo vuol dire accodare un'operazione **mentre** una `commitFiles` finta è sospesa, cioè un'impalcatura per React e per `fetch` che questo progetto non ha di proposito (→ ADR-0016: i test sono di dominio e dati). La garanzia qui è la lettura del codice e questo ADR; chi in futuro «semplificasse» `pending: remaining` in `pending: []` non troverebbe nessun test rosso, e per questo la ragione sta scritta nel commento accanto alla riga.
