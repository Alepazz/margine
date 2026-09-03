# ADR-0082: Le carte fedeltà stanno in un file cifrato loro, e sono di casa

**Status:** accepted · **Date:** 2026-09-02

## Context

Alessio, il 02/09/2026: «voglio integrare una sezione "Carte" in cui siano presenti le scansioni di tutte le carte. Praticamente quello che faceva Stocard, e che ora fa molto male Klarna». Le carte esistono già digitalizzate in quell'app, e alcune tessere fisiche non le ha più: la sorgente è l'app, non il portafoglio.

Una carta fedeltà porta con sé tre cose che il modello di Margine non ha mai avuto: un **codice** che non è un importo né una data, un **formato** di codice a barre da cui dipende se la cassa la legge, e un'**immagine** — la faccia della tessera, che è ciò che la rende riconoscibile in una griglia. L'immagine è la novità vera: finora nel dato cifrato non è mai entrato niente più grosso di una frase.

Tre posti possibili, e due si escludono:

- **In `Dataset`, accanto a `prices`.** È dove sono finite le rilevazioni di prezzo, che assomigliano alle carte per un aspetto — sono condivise e non sono spese. Ma `import.mjs` **ricostruisce il master da zero** ogni mese, quindi tutto ciò che nasce nell'app e vive in `Dataset` va ricopiato a mano nell'import o la sessione mensile lo cancella in silenzio: è già una cosa da ricordare per rimborsi e prezzi (→ ADR-0041), e sarebbe la terza. In più `expenses.json.enc` pesa 375 kB e la campanella lo **decifra due volte per ogni novità** (→ ADR-0051): le facce delle tessere peserebbero su ogni lettura di novità, per un dato che con le novità non c'entra.
- **In `AppConfig`.** Il file è piccolo, già scrivibile dall'app, già instradato da `touchesConfig`. Ma la configurazione è configurazione — categorie, entrate, saldo di partenza, repo — e un elenco di contenuto che cresce con delle immagini dentro non è quello. Il costo concreto: rinominare una categoria riscriverebbe anche le tessere, e ogni cifratura usa un IV nuovo (→ ADR-0025), quindi sarebbero centinaia di kilobyte di diff per un rinomino.
- **Un terzo file.** Costa che ogni posto che gestiva due file ne gestisca tre.

L'altra domanda era **di chi sono**. Il modello dell'app è a compartimenti: ogni statistica filtra su `shareOf(spesa, persona) > 0`, e il personale è separato per convenzione dell'interfaccia (→ ADR-0039). Alessio, sulle carte: «tutte condivise».

## Decision

`public/data/cards.json.enc`, **un terzo envelope**, con `CardsFile { version, updatedAt, cards: LoyaltyCard[] }`. `GithubConfig.cardsPath` è facoltativo come `configPath` e con la stessa regola — non si indovina un percorso su cui poi si committa (→ ADR-0024) — con un'aggravante: il file può non esistere, quindi un percorso sbagliato lo **creerebbe** invece di dare errore.

Il vantaggio decisivo del file separato è che **l'import non lo tocca**: il problema della ricopiatura non esiste invece di andare ricordato.

`LoyaltyCard { id, name, code, format, image?, color?, note?, addedAt }`. Tre scelte dentro:

- **`code` è testo, non un numero.** Un Code 128 può contenere lettere, e in un EAN-13 lo zero iniziale è una cifra come le altre — quella della prima carta importata comincia proprio per zero. In un `number` si perderebbe, e il campo nel modulo per la stessa ragione non è `type="number"`.
- **`image` è la tessera intera, come data URI**, non un logo su trasparente: è ciò che il ritaglio dalla griglia dell'altra app dà gratis. Sta **dentro il dato cifrato** e non fra i file del sito perché il repo è pubblico, e l'elenco delle carte fedeltà di due persone dice dove fanno la spesa (→ ADR-0026, ADR-0067). Il tetto è `MAX_IMAGE_CHARS` = 28.000 caratteri, cioè circa venti kilobyte, e non è un'ottimizzazione: una carta attraversa la coda in `localStorage`, dove il browser concede circa cinque megabyte in tutto, e una foto dalla galleria li riempie da sola — e quando `localStorage` è pieno la coda **non si salva più**, cioè le modifiche fatte offline si perdono in silenzio. Il ridimensionamento prima di accodare è quindi obbligatorio, dai due lati: `src/data/card-image.ts` nel browser e `scripts/import-cards.mjs` al Mac. Entrambi provano PNG **e** JPEG e tengono il più piccolo, perché le due strade vincono su contenuti opposti — una tinta piatta con un logo in PNG sta in pochi kilobyte, una foto di plastica con i riflessi fa l'opposto — e misurare toglie una scelta a indovinare. Misurato: il ritaglio vero di una tessera sta in 7 kB.
- **`color` si calcola una volta**, quando l'immagine entra, e non a ogni disegno: leggere i pixel di ogni tessera a ogni apertura dell'elenco sarebbe lavoro per un dato che non cambia. È il **colore più frequente dei bordi**, non la media: al centro c'è il logo, e la media di un logo bianco su fondo rosso è un rosa che non somiglia a nessuna delle due tinte. Verificato sul ritaglio vero: colore ricavato `#0060a8` contro una media dei canali di `#0b5ea1`.

**Le carte sono condivise**, come le rilevazioni di prezzo e per la stessa ragione: la carta del supermercato non è di nessuno dei due, è di casa. La pagina ignora `view.person` — è la **seconda** dell'app a farlo — e le funzioni di `domain/cards.ts` non ricevono mai un `PersonId`: è il tipo a dire che qui non ci sono compartimenti.

Nella coda tre operazioni: `card`, `card-edit`, `card-delete`. Il `card-edit` c'è, a differenza dei prezzi, perché una carta è uno **stato** — il nome si corregge, la faccia si sostituisce — mentre un prezzo di ieri è quanto costava ieri (→ ADR-0041). `touchesConfig`, che era un booleano, diventa `fileOf(op): 'data' | 'config' | 'cards'`, un'unione esaustiva: un'operazione nuova senza un file di destinazione non compila, invece di finire per sbaglio nel file delle spese e restare in coda per sempre.

**Una voce che non si potrà mai committare non blocca le altre.** Il percorso di un file può mancare in `config.json`, e la prima versione lo diceva con un `throw` sull'intero lotto: la voce impossibile restava in coda, ogni salvataggio successivo ricostruiva lo stesso lotto, e **niente ripartiva più** — né spese, né prezzi, né rimborsi, con l'unica via d'uscita di svuotare i dati del sito, cioè perdere la coda. Ora `flushOnce` separa: committa ciò che può, e ciò che non può lo **dice**, nominando le operazioni ferme. Le voci impossibili restano in attesa, perché il percorso può comparire domani. La stessa trappola c'era già per `configPath`, silenziosa: la cura è la stessa e vale per tutti e tre i file.

E siccome il modo migliore di non avere una voce impossibile è non produrla, senza `cardsPath` i pulsanti «Aggiungi una carta» **spariscono** e il `+` dell'isola torna al verbo di sempre. La prima versione calcolava la condizione e la usava solo per un avviso, mentre i pulsanti restavano attivi: la carta entrava in coda, compariva a schermo come salvata, e non partiva mai.

E `isAlreadyApplied` cambia forma: da `(dataset, config, entry)` a `(remote: RemoteView, entry)`, dove `RemoteView` ha **una chiave obbligatoria per file**, anche quando il valore può essere `undefined`. Non è pedanteria: un file aggiunto lì rompe la compilazione di ogni chiamante, che è l'unico modo di non dimenticarne uno — e dimenticarlo non darebbe un errore ma un **fantasma**, perché la catena di ADR-0069 giudicherebbe «non ancora applicata» l'ultima operazione e riapplicherebbe l'aggiunta di una carta cancellata.

## Consequences

L'app scarica un file in più a ogni apertura. Con le facce piccole sono decine di kilobyte, non centinaia; e il costo si annulla quando l'app funzionerà offline, dove il guscio e i dati arrivano dalla cache.

`decrypt`, `publish`, `validate`, `seed` e la coda gestiscono tre file invece di due. La chiave resta **una**: `publish.mjs` cifra i tre file con lo stesso salt di proposito, e l'app deriva una volta invece di tre — 600.000 iterazioni su un telefono non sono gratis. Quando la prima carta crea il file, la `kdf` da usare è quella già in mano (`kdfRef`), non una nuova: generarne una nuova costerebbe una derivazione in più a ogni sblocco, per sempre.

Che le carte siano condivise vuol dire che **non esiste una carta privata**. Se un giorno servisse, la strada è quella dei tricount — una lista di titolari sulla carta — e sarebbe un ADR suo; ma è anche il caso in cui la separazione conta meno, perché una tessera fedeltà non dice quanto hai speso.

Due difetti trovati **solo al banco**, e vale registrarli perché nessuno dei due lo coglieva un tipo:

- La faccia di una tessera senza immagine usava `inkOn(card.color)` con `color` assente, e quella funzione tornava «chiaro» come ripiego — testo bianco su una superficie chiara, cioè **bianco su bianco**. La cura è stata togliere `undefined` dalla firma: senza colore non si sceglie fra chiaro e scuro, si usa l'inchiostro del tema sulla sua superficie, che si leggono per costruzione.
- **Il numero di una carta serve sempre, e la clemenza verso il QR se lo mangiava.** `validateCard` perdonava a una carta a QR ogni verdetto del disegnatore, compreso «manca il numero», che quella funzione dice per prima. L'app salvava una carta senza codice, la pubblicazione la rifiutava, e `npm run encrypt` si fermava **senza scrivere nessuno dei tre file** — spese e configurazione comprese, e dal telefono nessun modo di capirlo. Ora il numero si pretende prima e fuori da quella clemenza. Lo stesso genere di divergenza c'era sulla data: la forma passava (`2026-02-30`) e il calendario no. Il test di parità ora copre tutti e due i casi, ed è il test che conta più degli altri.
- **«Non c'è» si riconosce in due modi, non uno.** `fetchOptionalEnvelope` trattava solo il `404` come assenza — che è la risposta di GitHub Pages, ed è giusta in produzione. Ma il server di sviluppo, per un percorso sconosciuto, risponde **`200` con `index.html`**: è il ripiego per le rotte di una SPA. Senza il secondo ramo, `npm run dev` con i dati veri (che non hanno ancora carte) **non apriva l'app affatto** — `response.json()` inciampava sulla pagina, e il messaggio diventava «non riesco a leggere i dati cifrati», cioè un guasto grave al posto di «nessuna carta». Il riconoscimento è un corpo che comincia per `<`, che non è ambiguo: un file cifrato non comincia mai così. Un `JSON.parse` che lancia o un envelope che non lo è restano guasti e si dicono, perché un file **illeggibile** non deve diventare un elenco vuoto e rassicurante (→ ADR-0053). Non c'è un test: `store.tsx` vorrebbe un'impalcatura per React e `fetch` che il progetto non ha, e la verifica è stata togliere il file dal banco e riaprire.
