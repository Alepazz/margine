# ADR-0047: La pagina non rimbalza

**Status:** superseded by ADR-0048 · **Date:** 2026-08-24

## Context

Segnalato dal telefono: «la barra del menù fluttua a volte più in alto a volte più in basso». L'isola della barra ha una posizione costante — `bottom: calc(env(safe-area-inset-bottom) + 14px)` — quindi la domanda è chi la muove.

Le ipotesi escluse, in ordine:

- **La safe-area che cambia valore.** In Safari iOS `env(safe-area-inset-bottom)` passa da 0 a ~34px quando la barra degli strumenti si ritira, e sarebbe esattamente un salto «a volte più in alto». Ma Margine si usa **installata sulla schermata Home** (`display: standalone` nel manifest), e là non c'è nessuna barra del browser che si ritira: il valore è fisso.
- **Un antenato con `transform` o `filter`**, che diventerebbe il blocco contenitore di un `fixed` e legherebbe l'isola all'altezza di quell'elemento, diversa da pagina a pagina. Cercato: `.app`, `.main` e `.content` non ne hanno; l'unico `backdrop-filter` è sull'isola stessa e sulla testata, che non la contengono.
- **`--tabbar-h` misurato male.** Quella variabile decide lo spazio che la pagina riserva in fondo, non la posizione dell'isola: sbagliata, manderebbe le ultime righe sotto il vetro, non muoverebbe il vetro.

Quello che resta è il **rimbalzo di fine corsa**. Su iOS lo scorrimento oltre il fondo o oltre la cima trascina con sé gli elementi `position: fixed`: l'isola sale quando la pagina rimbalza in fondo e scende quando rimbalza in cima, pur avendo una posizione costante — ed è per questo che la si vede ora più in alto ora più in basso, senza che niente nel CSS cambi. È una cosa nota della piattaforma, non un difetto del progetto.

Non è riproducibile sul banco: il rimbalzo è un comportamento del tocco su iOS, e nessuna delle due macchine su cui si misura qui (Chromium e WebKit da scrivania) lo esegue. La decisione poggia sul meccanismo, non su una misura.

## Decision

`html, body` dichiarano `overscroll-behavior-y: none`: il documento non rimbalza più, quindi non c'è nessuno spostamento da trascinare sull'isola.

Alternative valutate:

- **Ancorare l'isola al viewport visuale in JavaScript** (`visualViewport`, riposizionamento a ogni evento di scorrimento): funziona ovunque e in ogni causa, ma è un ascoltatore su ogni scorrimento per raddrizzare un elemento decorativo, e introduce il suo tremolio.
- **Un pavimento sulla safe-area** (`max(env(safe-area-inset-bottom), 20px)`): difenderebbe da un valore che va a zero per un istante, che è una cosa di cui non c'è nessuna prova qui. Un numero magico contro un'ipotesi non verificata.

## Consequences

L'app perde il rimbalzo elastico ai capi della pagina, che su iOS è un pezzo di gestualità familiare. È il prezzo accettato: in un'app installata a tutto schermo il rimbalzo non serve a niente — non c'è un «tira per aggiornare» sotto — mentre una cornice che non sta ferma si nota ogni volta.

Se lo spostamento restasse anche dopo questa riga, l'ipotesi successiva è il difetto noto dei `fixed` nelle app installate su iOS, che si staccano dal fondo dopo che l'app è stata in secondo piano; ma è un'altra causa e vuole un'altra decisione — non si allarga questa.

`overscroll-behavior` **non chiude anche il concatenamento dello scorrimento** dentro i fogli, che era già a posto: `.scroll-pane` ha il suo `contain`, e il corpo del foglio ora non scorre di lato per conto suo (→ ADR-0046).
