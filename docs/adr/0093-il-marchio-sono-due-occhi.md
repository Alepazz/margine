# ADR-0093: Il marchio sono due occhi, e le icone si generano tutte

**Status:** accepted · **Date:** 2026-09-03

## Context

Con il nome nuovo (ADR-0092) serviva un marchio. Il precedente erano quattro rettangoli — il filo rosso del margine e tre righe di quaderno — e non descriveva più un'app che tiene anche le tessere, la lista e i viaggi.

Il primo tentativo è stato un generatore (Recraft, dal prompt «arco romano spaccato da una linea rossa»): ha prodotto due mezzi archi con una riga in mezzo, e ha sbagliato un colore — grigio `#7C7E97` invece di `#8fa3b0`. Bocciato da Alessio: «ha solo i colori giusti, ma poca iniziativa». Da lì il disegno è passato a mano, con una regola di metodo: **ogni variante viene rasterizzata e guardata a 128, 64, 32 e 19 pixel**, perché quello che un segno *è* e quello che si *legge* sono due cose diverse.

L'idea l'ha data Alessio: due G speculari che sono anche i due occhi del dio, col trattino della lettera a fare l'occhio socchiuso. Quaranta varianti in sei giri hanno trovato un ostacolo che non è di esecuzione: **due segni affiancati alla stessa altezza dentro un quadrato stondato si leggono come una faccia.** È pareidolia. Appena i due anelli si distinguono diventano occhi e qualunque cosa stia sotto diventa una bocca (usciti: un cartone animato, un'arachide con la bocca, un robot che sorride); appena si avvicinano si saldano e diventano un ∞; un anello solo con due trattini diventa un mirino. L'unica simmetria che non ci casca è la **rotazione**, non la riflessione — ma un monogramma ruotato a 19 pixel è rumore.

Lo sblocco è stata la seconda correzione di Alessio: **il trattino non è una barra, è un occhio.** Sostituendo il rettangolo con una mandorla, le due G fuse smettono di leggersi come un ∞, perché due mandorle che guardano da parti opposte spiegano la forma.

Tre misure hanno poi deciso i colori. Il fondo di prima, `#101820`, è un blu-nero che l'occhio legge nero; alzando il blu il limite lo pone il rosso, che deve stare a 3:1 dal fondo per contare come elemento grafico (WCAG 1.4.11) e a `#1a3c6b` scende a **2,96:1**. Schiarire il rosso non è la via d'uscita: `#e0574c` contro l'ardesia `#8fa3b0` è già a 1,43:1, e di due gradini più chiaro scende a **1,05:1** — la mandorla si fonderebbe con l'anello grigio esattamente dove lo tocca. Per la stessa ragione l'anello del passato non diventa blu: contro il rosso starebbe a 1,29:1.

## Decision

Il marchio è **due G specchiate e fuse, con una mandorla rossa per occhio**: ardesia `#8fa3b0` l'anello che guarda al passato, carta `#e9eff3` quello che guarda al futuro, rossi `#e0574c` i due occhi, su fondo navy **`#12294a`**.

Il navy piatto batte la sfumatura, e non per i numeri: una sfumatura verticale da `#1a3c6b` a `#0d1c31` sui rapporti di contrasto vinceva — mettendo il blu chiaro in cima, dove non c'è niente da leggere, teneva il rosso a 3,76:1 sull'asse degli occhi. Ma nei provini a 64 pixel **si legge più scura del piatto**, perché la metà luminosa sta tutta in alto e l'occhio fa la media dell'insieme. Alla misura in cui l'icona vive davvero, il fondo che sembra più blu è quello piatto — e costa un rettangolo invece di due stop.

Tre scelte di costruzione, che sono quelle che un domani non vanno rotte per distrazione:

**La mandorla è l'intersezione di due cerchi, non una curva di Bézier.** Il cerchio ha raggio `(L² + H²) / 2H`, cioè 31,02 per una mandorla lunga 38 e alta 13. È la scelta che tiene d'accordo `public/favicon.svg` e `scripts/lib/icon-geometry.mjs`: un arco di cerchio l'SVG lo sa disegnare e lo script lo sa calcolare, una quadratica no — e due forme *quasi* uguali fra il vettoriale e il PNG sono un difetto che si vede solo affiancandoli.

**Il marchio è scalato a 0.9.** A piena misura arriva a 43,5 unità dal centro, e una maschera tonda — quella che Android applica alle icone `maskable` — ritaglia a 40: le punte degli anelli verrebbero tagliate. Misurato, non stimato.

**Le icone si generano tutte da una descrizione sola.** `npm run icon` scrive `icon-1024`, `icon-512`, `icon-192`, `apple-touch-icon` (180), `favicon-32`, `favicon-16` e un `favicon.ico` con dentro 16, 32 e 48. Le icone dell'app sono **quadrati pieni**, perché la maschera la mette il sistema e su iOS un angolo trasparente diventa bianco; le favicon sono stondate da noi, perché nella linguetta del browser nessuno le maschera.

Il rasterizzatore rifà la matematica invece di interpretare l'SVG: una corona circolare tagliata a un angolo, l'intersezione di due dischi, quattro campioni per lato per l'antialiasing. L'alternativa era un convertitore — e non c'è: `sharp` è un binario nativo che sta nel progetto solo per l'import delle carte, e Chrome headless renderebbe la generazione delle icone dipendente da un browser installato.

## Consequences

Il marchio si spiega su tre livelli — un emblema simmetrico, due G, due occhi che guardano in direzioni opposte — e i formati ci sono tutti, quindi la prossima misura che servirà è una riga in un elenco.

Il compromesso accettato è la misura minima: **sotto i venti pixel l'occhio non si legge**, e nella barra dell'app resta una sagoma con due tocchi di rosso. È lecito perché a quella misura serve il riconoscimento e non la lettura, e perché `favicon.svg` copre i browser che sanno leggerlo. Chi un domani volesse il dettaglio anche là deve cambiare marchio, non ritoccarlo.

La geometria vive in **due posti** che devono restare d'accordo — il vettoriale scritto a mano e le costanti da cui si rasterizza — e come ogni altra cosa che qui vive due volte ha un **test di parità**: `scripts/lib/icon-parity.test.mjs` legge i numeri da `public/favicon.svg` e li confronta con `scripts/lib/icon-geometry.mjs`. Ha guadagnato il suo posto alla prima esecuzione, trovando che un attacco d'arco scritto a mano diceva `39.37` dove il calcolo dà `39.38`: un centesimo di unità, invisibile a occhio, e il genere di divergenza che senza un test resta lì per anni. Per rendere quel test possibile la geometria è uscita da `make-icon.mjs`, che scrive file appena lo importi, ed è finita in `lib/`.

Una cosa resta più difficile: la sfumatura resta disponibile per il marchio grande (una schermata di sblocco, un domani un sito), ma se ci si torna va rimisurata: i rapporti sull'asse degli occhi valgono per *quella* coppia di stop.

La lezione che vale oltre questo caso: **un generatore d'immagini disegna ma non giudica.** Non poteva scoprire la pareidolia né vedere che a 32 pixel il suo arco diventava una «n», perché non guarda il risultato alla misura in cui vivrà. Il ciclo che ha funzionato è disegna → rasterizza → guarda, e la stessa disciplina ha bocciato la sfumatura che i numeri avevano promosso.
