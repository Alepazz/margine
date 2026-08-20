# ADR-0024: Le categorie e le entrate si modificano dall'app

**Status:** accepted · **Date:** 2026-08-20

## Context

Fino a ieri l'app scriveva **un file solo**: `public/data/expenses.json.enc`. La configurazione — categorie, sottocategorie, colori, profilo entrate — la leggeva al caricamento e non l'aveva mai riscritta. Cambiare una categoria voleva dire aprire il computer di casa, modificare `data/config.json`, rilanciare `npm run validate` e `npm run encrypt`, e committare.

Due richieste dello stesso giorno hanno reso quel confine insostenibile. La prima: «aggiungere la possibilità di poter creare una nuova categoria o rimuovere una esistente; se quella esistente ha già degli assegnamenti allora va chiesto all'utente come spostare di categoria le spese». La seconda, sull'obiettivo di risparmio di Federica: «200, ma fallo configurabile». Sono la stessa richiesta vista da due lati — una cosa che sta nella configurazione e che si vuole cambiare dal telefono — e nessuna delle due si può fare in sola lettura.

C'era anche un motivo indipendente per farlo adesso: il netto in busta paga di Alessio è ancora una **stima** dalla RAL, e ogni volta che quel numero cambia oggi serve una sessione al Mac. Un'app che misura il margine e non sa aggiornare le entrate misura il margine di ieri.

## Decision

`config.json.enc` diventa un file che l'app **riscrive**, esattamente come fa con le spese: stessa coda di operazioni, stesso salvataggio ottimistico, stesso commit via API GitHub. La coda cresce di tre tipi — `categories` (l'elenco intero, nuovo), `recategorize` (le spese di una categoria passano a un'altra), `income` (il profilo di una persona) — e acquista un secondo applicatore, `applyConfigOps`, perché la configurazione è un altro envelope cifrato e non un ramo del dataset.

`categories` porta **l'elenco intero** e non un delta. La tassonomia è una lista ordinata in cui gli slot di colore devono restare coerenti fra loro: due delta applicati in ordine diverso darebbero due liste diverse, mentre una sostituzione è idempotente per costruzione — riapplicarla due volte dà lo stesso risultato, che è quello che serve a una coda che può riprovare.

Cancellare una categoria che ha spese dentro **chiede dove spostarle** e mostra quante sono. Le due operazioni — spostare le spese, togliere la categoria — partono insieme e finiscono in un commit solo (→ ADR-0025). La sottocategoria si perde, perché appartiene alla categoria di partenza e nella nuova non esiste.

Il percorso del file cifrato della configurazione si dichiara in `github.configPath`. **Non si indovina** da `dataPath`: un percorso su cui si committa non è il posto per una regola euristica. Se manca, categorie ed entrate restano modificabili solo localmente e sia l'app sia `npm run validate` lo dicono.

`scripts/lib/taxonomy.mjs` smette di essere la fonte di verità e diventa il **valore iniziale**: alimenta i dati di esempio del seed e la prima configurazione di un'installazione nuova. Il controllo di divergenza in `validate` resta, ma cambia significato — non è più il sintomo di un errore, è l'informazione che i due si sono separati.

Le categorie a cui la configurazione fa riferimento per nome — `catCategory`, `tripCategory`, `houseCategory` — **non si cancellano dall'app**: senza di loro la pagina del gatto e le fette di un viaggio non saprebbero cosa guardare.

## Consequences

Il netto in busta paga, l'obiettivo di risparmio e la tassonomia si cambiano dal telefono, e valgono su tutti i dispositivi perché stanno nel file cifrato e non nel browser.

In cambio, la configurazione diventa **modificabile da un posto in cui non c'è `npm run validate`**. Il cancello che tiene i dati sani stava tutto nella sessione mensile; adesso una parte delle regole va ripetuta nell'app — le categorie di riferimento bloccate, il tipo orfano azzerato quando una spesa cambia categoria — e ogni regola ripetuta è una regola che può divergere. È lo stesso prezzo già pagato per le regole della spesa (ADR-0018), con la stessa mitigazione: la validazione della sessione mensile resta e continua a essere l'ultima parola.

Un riferimento a una categoria che non esiste più diventa un caso **normale** e non una svista: i suggerimenti del 730 sono id scritti a mano in mezzo alla configurazione, e una categoria cancellata li rende muti — cercare qualcosa che non c'è non è un errore, quindi nessuno se ne accorgerebbe. `npm run validate` adesso li controlla; l'ha trovato subito, sulla prima migrazione.

Restano fuori dall'editor delle entrate i **buoni pasto**, di proposito: stanno a zero perché i pranzi che pagano non sono nei tricount (ADR-0014), e un campo modificabile inviterebbe a romperlo.

Restano fuori anche le **sottocategorie**: si creano e si cancellano solo nella sessione mensile. Non è una decisione di principio, è che la richiesta era sulle categorie e un editor annidato è un'altra cosa.
