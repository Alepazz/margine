# ADR-0054: Spente vuol dire spente

**Status:** accepted · **Date:** 2026-08-27

## Context

ADR-0052 ha deciso che il contenuto delle novità si carica **prima** che la campanella si apra, perché il numero sul pallino è la lunghezza dell'elenco e un elenco non ancora risolto darebbe un numero sbagliato. Nel codice questo vuol dire all'apertura dell'app: la lista dei commit — 173 KB — e fino a cinque coppie di file cifrati.

Alessio ha guardato quel costo e ha posto la domanda giusta: si paga anche quando la campanella non si apre mai. «O le notifiche vengono spente, e quindi questa operazione non venga più fatta nemmeno all'avvio, oppure le notifiche vengono lette quasi quotidianamente e quindi la risoluzione delle stesse all'apertura app non ha un peso così impattante.»

Il ragionamento regge, e metteva il dito su un difetto vero: spegnere tutti i gruppi in Impostazioni **filtrava il risultato** ma la richiesta partiva lo stesso. Chi aveva deciso di non volere le notifiche ne pagava comunque il costo, e — cosa peggiore — consumava il proprio limite di richieste a GitHub per un risultato che veniva buttato via.

## Decision

**Con nessun gruppo acceso, `loadNews` esce subito**: nessuna richiesta, elenco vuoto, errore azzerato. Non «scarica e non mostra», ma «non scarica».

Questo è ciò che rende **lecito** tenere il caricamento all'apertura dell'app, che è la scelta di ADR-0052 e che qui non cambia: il costo esiste solo per chi le notifiche le vuole, e chi le vuole le legge. Le due cose sono una sola decisione — l'anticipazione si paga con la possibilità di rinunciarci del tutto.

L'uscita anticipata sta **sopra** l'assegnamento di `lastNews.current`, non sotto. Sotto, il ritorno marcherebbe un «già letto un attimo fa» che non è mai avvenuto, e riaccendere un gruppo lascerebbe la campanella muta fino a un minuto: l'effetto che rilancia `loadNews` ha `newsGroups` fra le dipendenze e scatta all'istante, ma troverebbe la guardia chiusa. L'ordine di quelle righe è logica, non stile.

## Consequences

Misurato sul banco: con i quattro gruppi spenti l'apertura dell'app fa **zero** richieste ad `api.github.com`; con tutti accesi ne fa **una**, e da lì partono i dettagli. Con la campanella chiusa e i gruppi accesi, quattro dettagli scaricati prima di qualunque tocco — che è ciò che ADR-0052 prometteva e che qui è stato verificato.

Resta la finestra che ADR-0052 dichiara e che non si chiude: nei primi istanti dopo il lancio il pallino può contare una riga che poi sparisce, se quel salvataggio era tutto nel compartimento personale dell'altra persona. Ora però dura quanto le richieste all'avvio e non quanto l'apertura del foglio, quindi non la si vede più mentre si legge. Chiuderla del tutto vorrebbe dire scrivere nel messaggio di commit cosa conteneva, cioè in chiaro su un repo pubblico. → ADR-0051

Un vincolo nuovo da non rompere per distrazione: il ramo che esce subito **azzera anche l'errore**, perché uno stato spento non può portarsi dietro il guasto di quando era acceso. Ogni percorso di successo di `loadNews` — oggi ce ne sono due — deve azzerarlo; un terzo che se ne dimenticasse lascerebbe a schermo un errore che non è più vero. → ADR-0053
