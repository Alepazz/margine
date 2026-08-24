# ADR-0049: L'isola torna a fluttuare sopra il contenuto

**Status:** accepted · **Date:** 2026-08-24

## Context

ADR-0048 ha tolto la barra da `position: fixed` e l'ha messa nel flusso, come ultima riga del guscio, perché così non la può spostare nessuno. Ha funzionato — sta ferma — ma ha cambiato la cosa sbagliata: il contenuto non le scorre più sotto, e al suo posto compare in fondo una fascia di carta che si legge come un piede di pagina. Alessio l'ha bocciata subito: «la barra è incollata al fondo ed il contenuto scorre sotto uno strato di footer. Io voglio la barra volante fissa sul fondo, come uguale uguale ad Epilog».

Aperto il codice di Epilog, il paragone si è rivelato una ricetta completa — e dice che ADR-0048 aveva ragione a metà. Là c'è, alla lettera:

- `body { height: 100dvh; overflow: hidden }`, con questa nota accanto: «La pagina non scrolla: scorre .app al suo interno, così la tabbar fissa resta ancorata in basso e non "balla" con la toolbar di Safari mobile».
- `.tabbar { position: fixed; bottom: calc(env(safe-area-inset-bottom) + 14px); left: 50%; transform: translateX(-50%); … }` — cioè esattamente la barra che Margine aveva **prima** di ADR-0048, stessa formula e stessi 14px.
- `--page-bottom-pad: 112px`, una costante, commentata «spazio per la tabbar a isola fluttuante (chrome, NON scala)».

Quindi non era `fixed` il colpevole, ed è un errore di attribuzione che vale la pena registrare: la barra ballava per la **coppia** «`fixed` sopra un documento che scorre». Togliendo lo scorrimento al documento — che è la metà buona di ADR-0048 — non esiste più nessuno scorrimento che il rimbalzo, la tastiera o lo scorrimento verso il campo a fuoco possano trascinare, e `fixed` diventa fermo. Sacrificare anche il `fixed` era una seconda amputazione che non serviva, e costava l'unica cosa per cui l'isola esiste: fluttuare.

## Decision

L'isola torna `position: fixed` con la formula di prima, che è anche quella di Epilog, **sopra il guscio non scorrevole di ADR-0048**. Il contenuto le passa sotto e si intravede attraverso il vetro.

La pagina si riserva di nuovo lo spazio in fondo, ma con una **costante** (`--tabbar-reserve`, `safe-area + 110px`) e non più con la misura a runtime di `--tabbar-h`: il `ResizeObserver` resta cancellato. Perché la costante sia lecita, la tipografia dell'isola passa da `rem` a **px** — glifo 23px, etichetta 12px. Non è un dettaglio: l'isola è cornice, e la regola di questo progetto dice da sempre che il contenuto sta in `rem` e la cornice in px. L'isola la violava, ed è per quella violazione che la sua altezza era emergente e andava misurata. Rispettata la regola, l'altezza è ferma a 79px (misurata) e la somma `14 + 79 + 17` è un numero che si può scrivere in un foglio di stile. È la stessa scelta di Epilog, che i suoi 112px li tiene costanti per la stessa ragione dichiarata.

Nello stesso giro, il campo della data: su iOS `input[type="date"]` è un controllo di sistema la cui larghezza minima **non rispetta né `width: 100%` né `min-width: 0`** — sbordava a destra oltre il bordo del foglio mentre ogni altro campo stava dentro al pixel. Prende `appearance: none`, che gli toglie l'impianto nativo e restituisce la larghezza al CSS; il selettore a rotella resta, perché lo apre il tipo del campo e non il suo aspetto.

## Consequences

L'isola fluttua e sta ferma, e le due cose non sono in contrasto: la prima è il suo `fixed`, la seconda è il guscio sotto. Restano legate per sempre, ed è la cosa da ricordare: **rimettere lo scorrimento al documento farà tornare l'isola a ballare**, perché è quella coppia il difetto, non uno dei due pezzi.

La costante al posto della misura sposta un vincolo dal codice alla disciplina: se un giorno la tipografia dell'isola tornasse in `rem`, o le si aggiungesse una riga, i 110px ricomincerebbero a mentire e le ultime righe di ogni pagina finirebbero sotto il vetro — che è esattamente il difetto per cui il `ResizeObserver` era nato. Il presidio è la regola cornice-in-px, scritta in due posti (qui e nel commento di `--tabbar-reserve`).

Del campo della data non ho una prova: non si riproduce sul banco, nemmeno in WebKit con l'emulazione iPhone, perché da scrivania quel controllo è un'altra cosa e sta comodamente dentro. Ho verificato solo che `appearance: none` non rompa niente — valore al suo posto, larghezza dentro il foglio, tipo `date` intatto — e ho lasciato **volutamente** stare l'altezza, che sul banco viene 4px più alta di un campo di testo: accordarla lì vorrebbe dire tarare il vestito su una piattaforma diversa da quella del difetto.

Questo ADR **rovescia una sola scelta di ADR-0048**, la barra nel flusso. Tutto il resto di quella decisione resta in vigore e ne è il presupposto: il guscio alto `100dvh` che non scorre, `.content` come unico riquadro scorrevole, e il blocco dello scorrimento dietro i fogli che ne discende.
