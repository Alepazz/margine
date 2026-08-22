# ADR-0044: La barra serve i due scopi dell'app, e la quinta voce è una pagina

**Status:** accepted — la sola scelta del selettore del tricount (la fila di chip) è rovesciata da ADR-0045 · **Date:** 2026-08-21

## Context

L'app ha **due scopi**: il tricount con le sue statistiche, e i prezzi al supermercato (→ ADR-0041). La navigazione ne serviva uno solo, perché è nata prima dell'altro: nella barra c'erano quattro viste del mondo tricount — Riepilogo, Casa, Gatto, Vacanze — mentre **Prezzi** stava in fondo a un menù `⋯` nella testata, in alto a destra. Consultare un prezzo costava tre gesti (`⋯`, la voce fra cinque, poi la ricerca), e il primo era nell'angolo più lontano dal pollice. Per l'attività che si fa **in piedi, col carrello**, era il percorso più lungo dell'app.

Altri due attriti della stessa origine:

- **Il `+` dell'isola conosceva un verbo solo**, «aggiungi una spesa». L'altra metà dell'app non aveva un'azione primaria da nessuna parte.
- **Il tricount di una spesa si scriveva in una tendina.** È il campo da cui dipende tutto il resto del modulo, ed è quello il cui errore costa più caro — una spesa nel tricount sbagliato va poi spostata a mano — ma una tendina mostra solo il valore corrente e tiene le alternative dietro un tocco.

Le alternative valutate per la barra:

- **Tenere Vacanze e mettere Spese nel menù.** Il mappamondo è la pagina più bella dell'app, ma si apre ogni tanto; l'elenco delle spese è dove si cerca e si corregge una voce, cioè la consultazione più frequente dopo il Riepilogo.
- **Il `+` apre un foglio di scelta «Spesa / Prezzo».** Il verbo del pulsante non cambierebbe mai, ma tasserebbe di un tocco **ogni** spesa per risparmiarne uno sui prezzi, e il rapporto d'uso va nell'altra direzione.
- **La quinta voce come foglio-menù** (la prima stesura del piano, in `docs/piano-restyle.md`): sarebbe stato il vecchio `⋯` spostato sotto il pollice. Un cassetto: ti porta da qualche parte senza dirti niente finché non ci sei arrivato.

## Decision

La barra è **Riepilogo · Spese · `+` · Prezzi · Esplora**, e il `+` aggiunge **la cosa della pagina in cui sei**: su `/prezzi` registra un prezzo, ovunque altro una spesa (`aria-label` e `title` cambiano con la rotta, così anche chi legge con la voce sa quale verbo sta per usare).

**Esplora** (`/esplora`) è una **pagina** con sei schede in due gruppi — Raccolte (Casa, Gatto, Vacanze) e Analisi (Statistiche, 730, Saldo) — e ogni scheda porta **il suo numero già in vista**: la quota di casa del mese, quella del gatto, l'ultimo viaggio, la sparkline di dodici mesi, le voci marcate per il 730, il saldo con chi deve a chi. È il patto che rende accettabile aver spostato Casa, Gatto e Vacanze da un tocco a due: il primo tocco **informa**, e quando il numero basta il secondo non serve più.

Il **Riepilogo** invece non diventa un hub, di proposito: è già la risposta a una domanda, e spezzarlo in schede-porta aggiungerebbe un livello a ciò che si legge in una schermata. La gerarchia paga dove il livello intermedio informa; dove la pagina è già la destinazione, costa solo tocchi.

Due conseguenze di dettaglio che vale la pena aver scritto:

- **Il link «‹ Esplora» dentro le sei viste lo rende il guscio, non le pagine.** `AppShell` è l'unico posto che sa quali rotte stanno nell'hub (`HUB_ROUTES`), quindi sei pagine non possono divergere dalla barra il giorno che una voce cambia posto. Esiste solo su telefono: su schermo grande ci si arriva dalla colonna, e un «indietro» punterebbe a una pagina che non si è attraversata.
- **Sulla colonna laterale l'hub non c'è.** Le dieci voci si mostrano tutte, coi due gruppi come intestazioni: dove lo spazio c'è, non si nasconde niente. L'hub è una concessione al telefono, non un'architettura.

Il tricount di una spesa si sceglie con **una fila di spunte** (`.choice-chip`), che mostra dove sta andando la spesa **e dove non sta andando**. Le opzioni restano quelle di `tricountOptions` — solo i propri, i conclusi fuori tranne quello della spesa in correzione (→ ADR-0037, ADR-0027) — e la fila va a capo senza allargare il foglio (→ ADR-0033).

## Consequences

Prezzi passa da tre gesti a uno, e registrare passa da quattro a due. Casa, Gatto e Vacanze pagano un tocco in più, ammorbidito dalle anteprime. La rotta `/esplora` è l'unica aggiunta: nessun percorso esistente cambia, quindi i segnalibri sui due telefoni continuano a funzionare.

**Le vacanze nei chip stanno raccolte sotto «🌍 Vacanze (n)», e non è un ripensamento a metà.** Mostrarle tutte è stato provato sul banco: coi viaggi aperti che oggi sono cinque diventano otto chip su **cinque righe**, e «Cos'era» e «Quanto» — i due campi che si scrivono ogni volta — finiscono sotto la piega a ogni singola spesa, per tenere in vista alternative che nella spesa di tutti i giorni non si scelgono mai. Collassate sono cinque chip su tre righe. Si aprono da sole quando la spesa **è** in una vacanza (inserendo durante un viaggio o correggendone una), restano aperte per tutto il foglio, e il numero sul chip dice che stanno lì — un chip muto avrebbe fatto credere che le vacanze non ci fossero. Nota per chi legge fra sei mesi: questo rende il difetto **indipendente** dalla domanda aperta «le cinque vacanze vecchie vanno marcate concluse?». Marcarle resta giusto (→ ADR-0027), ma non è più ciò che tiene in piedi l'ergonomia del modulo.

**Il modulo dei prezzi non si chiude quando salva.** Registrare i prezzi è una sessione, non un gesto: si fa il giro degli scaffali, e supermercato e data sono gli stessi per tutti i prodotti. Dopo un salvataggio restano quelli e si azzera il resto, col fuoco di nuovo sul prodotto: cinque prodotti passano da cinque moduli interi a un supermercato più cinque coppie nome/prezzo. Il modulo è quindi diventato un foglio dal basso (`PriceSheet`), perché ora lo apre anche il `+` da qualunque pagina, e perché a foglio aperto l'elenco sotto resta dov'era — al supermercato si alterna «quanto costava?» e «lo registro».

Un terzo difetto trovato solo misurando, e il più insidioso dei tre perché non somigliava a un errore: le schede dell'hub stavano in una griglia a `grid-template-columns: 1fr`, il cui **minimo implicito è `auto`**, cioè il min-content. La sparkline larga 76px allargava la traccia, e la traccia è condivisa da tutte le righe: sfondavano di 27px anche le schede del 730 e del saldo, che non hanno grafici. Si dichiara `minmax(0, 1fr)`. È ADR-0033 con un vestito nuovo — là era un elemento flex, qui una traccia di griglia — e la regola che li unisce è la stessa: **la larghezza di un contenitore non la decide il suo contenuto**.

Nel farlo è emersa una trappola che il piano aveva previsto e che si è manifestata esattamente come scritto: azzerare `unitTouched` **non basta**, va rimessa anche `unit` a `kg`. Con l'unità ancora su «al pezzo», il prodotto successivo — che non avendo una sua unità nei dati non ha niente da suggerire — ripartiva da lì: l'unità del pecorino appiccicata al latte, cioè lo sbaglio da un tocco che spacca in due gruppi un prodotto che si vuole confrontare. È il genere di difetto che i tipi non vedono e che si trova solo aprendo il browser.

La revisione del diff ha trovato un quarto difetto, ed è quello che vale di più aver scritto perché non era un dettaglio: il gruppo delle vacanze era **uno stato indipendente**, e come tale aveva tre ingressi da ricordare a mano — la correzione di una spesa in vacanza, il primo tricount offerto che è un viaggio, e la vacanza appena creata dal modulo. Il terzo era scoperto: creata «Grecia 2026», il resto del modulo passava in modalità vacanza mentre la fila mostrava soltanto i tricount piani, **senza nessun chip acceso**. Una fila senza selezione fa toccare il primo chip visibile, cioè sposta la spesa fuori dal viaggio appena creato — precisamente ciò che ADR-0027 vieta al selettore del tricount. La correzione non è stata aggiungere la chiamata mancante, ma **derivare**: `showTrips = tripsOpened || isVacation`. Così non esiste un quarto ingresso da dimenticare, e l'inizializzatore che leggeva `editing` è sparito. La regola generale: se una cosa è una conseguenza di un'altra, tenerla in uno stato separato è tenersi un elenco di posti da aggiornare a mano.

Nello stesso giro, due promesse che il codice non manteneva: la fila si dichiarava `radiogroup` mentre conteneva due azioni che non sono scelte (ora è `group` con `aria-pressed`, come il controllo segmentato del progetto), e il foglio dei prezzi lasciava il fuoco sul `+` dietro il velo mentre un commento affermava il contrario. Un `NavLink` inoltre applica `aria-current` **solo** sulla propria rotta, quindi la voce Esplora accesa dentro le sue sei viste non lo riceveva: là serve un `Link`.

Quello che resta da presidiare è il patto delle anteprime: **un'anteprima che dicesse un numero diverso da quello della sua pagina sarebbe peggio di nessuna anteprima.** Escono tutte da selettori che esistono già e rispettano `view.person` come le pagine che aprono; se un giorno un'anteprima nuova pretendesse un selettore nuovo nel dominio, si semplifica l'anteprima — non è l'hub il posto dove il dominio cresce. Un caso è già particolare e va saputo: l'anteprima di **Casa** somma i due insiemi di ADR-0017, cosa lecita perché `houseOutside` esclude per costruzione il tricount di casa e quindi non c'è intersezione da contare due volte. È il solo posto in cui casa è un numero unico: la pagina li tiene separati perché là si guarda **cosa** è casa, non quanto.

Il menù `⋯` e il suo foglio sono stati eliminati, non spostati: due strade per raggiungere le stesse sei viste sarebbero due comportamenti da tenere allineati a mano. `LedgerSelect` invece resta, e non è un residuo: lo usa il pannello «Sposta di tricount» nel foglio di dettaglio, dove la scelta è un gesto occasionale dentro uno spazio strettissimo.
