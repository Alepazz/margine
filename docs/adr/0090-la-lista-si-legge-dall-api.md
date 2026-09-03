# ADR-0090: Il file della lista si legge dall'API mentre la pagina è aperta

**Status:** accepted · **Date:** 2026-09-03

## Context

L'app legge i dati dal **sito**: `public/data/*.enc` serviti da GitHub Pages, con `cache: 'no-store'`, riletti al più una volta al minuto. Ha funzionato per tutto finora perché tutto finora cambiava qualche volta al giorno.

La lista della spesa cambia venti volte in mezz'ora, e ogni cosa presa è un commit (→ ADR-0088). Misurato il 03/09/2026 su questo repo:

- il deploy è un **workflow** (`build_type: "workflow"`), non il vecchio flusso Jekyll, quindi il limite di dieci ricostruzioni all'ora che si legge nella documentazione di Pages **non si applica**;
- ma `.github/workflows/deploy.yml` dichiara `concurrency: { group: pages, cancel-in-progress: false }`, quindi i deploy stanno in coda **uno alla volta**;
- e durano dai **31 ai 51 secondi** (77 il caso peggiore su dodici run), perché il workflow fa test, typecheck e build a ogni push.

Venti spunte fanno quindi una coda di una dozzina di minuti, durante la quale il repo è aggiornato e **il sito no**. Le proprie spunte si vedono comunque, perché la coda locale si riapplica sopra ciò che si scarica; a mancare è solo quello che ha fatto l'altra persona — che è esattamente il caso per cui una lista condivisa esiste.

Le alternative erano accorpare le spunte in un commit ogni trenta secondi (che rovescia in parte la scelta di ADR-0088 e ritarda quello che si fa alla cassa) o accettare il ritardo. Alessio ha scelto la lettura dall'API.

## Decision

**Per il solo file della lista**, una seconda via di lettura: `getFile(github, token, github.shoppingPath)`, che legge dall'API alla punta del branch, dove il contenuto è aggiornato appena il commit passa. Risondata ogni 30 s mentre la pagina della lista è montata, e a ogni ritorno in primo piano — durante una spesa il telefono si spegne e si riaccende continuamente.

**Non sostituisce niente.** All'apertura dell'app i quattro envelope arrivano dal sito come sempre: un percorso solo, nessun token necessario, e il salt serve comunque allo sblocco. Questa è una freschezza **in più**, che una pagina chiede finché è aperta.

Tre scelte dentro, e sono quelle che contano:

- **Senza token non si sonda affatto.** Il limite di GitHub senza autenticazione è di sessanta richieste all'ora per indirizzo IP, e la campanella già le consuma: finirle la rende muta senza poterlo spiegare, che è il difetto di ADR-0053 ed è già costato dieci minuti a cercare una regressione che non c'era. Meglio una lista vecchia di qualche minuto che una campanella spenta.
- **La sonda dice *perché* non ha letto**, non solo che non ha letto: `'ok' | 'no-token' | 'failed'`. Senza token è uno stato normale, di cui la spia di sincronizzazione parla già, e ripeterlo nella pagina sarebbe rumore — l'ho visto al banco, dove il messaggio compariva sempre. Una lettura **fallita** invece si dice, perché quello che si sta guardando può essere vecchio.
- **Una sonda fallita non svuota la lista**: si tiene ciò che si ha. Un elenco vuoto per una lettura andata male è indistinguibile da uno vuoto perché non c'è niente da comprare, e la seconda cosa è rassicurante mentre la prima non lo è. È la lezione di ADR-0053 applicata prima di sbagliarla.

## Consequences

Due percorsi di lettura invece di uno, con freschezze diverse di ordini di grandezza: il sito per l'apertura, l'API per la pagina aperta. La regola generale che ne esce, e che vale per la prossima scrittura frequente che si vorrà aggiungere: la domanda non è «il repo regge?» — regge — ma «chi legge dal sito cosa vede, e quando?».

Il costo in richieste è una all'ogni mezzo minuto mentre la pagina è aperta: centoventi all'ora contro le cinquemila che GitHub concede con un token. Non lo sfiora.

Quello che **non** si risolve: la campanella e i dati delle spese continuano ad arrivare dal sito, quindi durante una spesa lunga il resto dell'app resta indietro come prima. È voluto — quelle cose non cambiano venti volte in mezz'ora — ma è la ragione per cui questo ADR parla di un file e non di un'architettura.
