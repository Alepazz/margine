# ADR-0085: La tessera si apre a tutto schermo, e i dettagli sono un passo dopo

**Status:** accepted · **Date:** 2026-09-02

## Context

La prima versione della tessera aperta (→ ADR-0084) la mostrava **dentro** l'app: testata, collegamento «‹ Carte», isola della navigazione, e una scheda «Dettagli» che si apriva sotto a richiesta. Alessio, il 02/09/2026, guardando le sue carte vere sul banco: «Quando apro una carta, vorrei che tutta l'applicazione venisse oscurata e ci fosse solo la carta, in modo da avere il codice bello visibile, che è quello che poi le cassiere scannerizzano. Se clicco dettagli invece va via la parte scura e si arriva alla situazione attuale, quella in cui la carta è dentro l'applicazione e sotto appaiono i dettagli».

È anche ciò che fanno Stocard e Klarna, e la ragione è la cassa: chi apre una tessera la sta porgendo a un lettore, e tutto quello che sta intorno al rettangolo bianco — compresi il proprio nome della pagina e la barra per andare altrove — è rumore in quel momento. I dettagli (numero in chiaro, tipo di codice, data, nota, modifica, eliminazione) servono un'altra volta, a casa.

## Decision

`/carte/:id` parte in **primo piano** (`CardFocus`): un fondo scuro quasi opaco su tutta l'app, sopra testata e isola, e in mezzo la sola tessera — fascia col nome, faccia bianca col codice a barre più alto (160px) e il numero più grande. Si chiude toccando il fondo, con «Torna alle carte» o con Esc, e porta **al mazzo**. «Dettagli» toglie il primo piano e mostra la vista dentro l'app con la scheda dei dettagli sotto; lì lo stesso bottone dice «A tutto schermo» e riporta davanti al lettore.

Lo stato è **locale** (`useState(true)`), non nell'URL. L'alternativa `/carte/:id/dettagli` è stata scartata: con due rotte, «indietro» dai dettagli riporterebbe al primo piano, mentre da una tessera si torna al mazzo — è il gesto della cassa, dove si passa da una tessera all'altra. L'alternativa di un foglio al posto della rotta era già scartata in ADR-0084.

La tessera è **un componente solo**, `CardBody`, usato da entrambe le viste: cambia solo il bottone nella fascia. Il fondo è `--card-focus`, un token definito **identico nei tre stati di tema** come `--card-face`: è scuro anche col tema chiaro, perché non è un velo sulla pagina ma la pagina che se ne va. Il tocco sul fondo si riconosce dal **bersaglio** (`event.target === event.currentTarget`) e non fermando la propagazione dentro la tessera: così un tocco sulla faccia — che alla cassa arriva per sbaglio, allungando il telefono — non chiude niente.

## Consequences

- Aprire una tessera è **sempre** il primo piano, anche da un segnalibro o riaprendo il telefono bloccato: è l'unica cosa che serve in quel momento.
- Il primo piano sta dentro `.content`, quindi `useScrollLock` è **obbligatorio** finché è montato: un trascinamento sul fondo farebbe scorrere la pagina sotto, invisibile ma spostata.
- Sta a `z-index: 40`, il livello dei fogli, e sotto i messaggi (50). Il foglio di modifica si apre solo dalla vista dentro l'app, quindi i due non si incontrano mai.
- `useWakeLock` resta nella pagina e vale in entrambe le viste.
- Il fondo a 0,96 di opacità lascia intravedere la testata: è voluto, si capisce dove si è senza che niente distragga.
