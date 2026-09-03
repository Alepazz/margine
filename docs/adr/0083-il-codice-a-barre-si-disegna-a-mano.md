# ADR-0083: Il codice a barre lo disegniamo noi, e lo verifica un decodificatore indipendente

**Status:** accepted · **Date:** 2026-09-02

## Context

Una carta fedeltà serve a una cosa: farsi leggere da un lettore ottico alla cassa. Il codice va quindi **disegnato**, da un numero e da un formato, e la correttezza qui è binaria — o passa o non passa — e si scopre nel posto peggiore, con la fila dietro.

L'analisi di fattibilità del giorno prima raccomandava `jsbarcode`: undici kilobyte compressi, mantenuta, e «una libreria è meno rischio di una tabella ricopiata». Aperto il codice, tre fatti hanno rovesciato quella raccomandazione:

1. **Il progetto ha un precedente esplicito.** ADR-0020: la proiezione ortografica del mappamondo sono trenta righe invece di `d3-geo`, e `world-atlas` resta una dipendenza di sviluppo — «nel pacchetto entra il dato, non la libreria».
2. **Una libreria che disegna nel DOM non si può provare dove girano i test.** L'ambiente di `vitest` in questo progetto è `node`: `jsbarcode` renderizza dentro un elemento, quindi la parte che decide se una tessera passa alla cassa sarebbe l'unica cosa importante dell'app **senza un test**. Un encoder è invece una funzione pura, che è esattamente ciò che `src/domain/` contiene.
3. **La preoccupazione della «tabella ricopiata a mano» si può eliminare misurando**, non fidandosi. Le tabelle di questi standard sono dati puri; e a valle esiste un modo di verificarle che non passa dal nostro codice.

Le tabelle degli standard sono anche **immutabili**: EAN-13 e Code 128 non cambieranno. Non c'è niente da rigenerare, quindi tenere una dipendenza e un generatore per sempre — come per il mappamondo, dove i confini dei paesi cambiano — sarebbe peso senza uno scopo futuro.

## Decision

`src/domain/barcode.ts`: funzioni pure che da `(code, format)` producono una **stringa di moduli** — `'1'` barra, `'0'` spazio — più la zona di quiete in moduli. Cinque formati: EAN-13, EAN-8, Code 128, Code 39, ITF. Chi disegna (`components/Barcode.tsx`) non sa niente di codici a barre: legge i moduli e fa dei rettangoli.

Le tabelle sono state **generate una volta** dai dati di `jsbarcode` (MIT), che le porta in forma leggibile da una macchina, e poi la dipendenza è uscita dal progetto. Nessuna cifra è stata trascritta a mano.

**La verifica è un giro completo attraverso un decodificatore indipendente.** `scripts/lib/barcode-roundtrip.test.mjs` disegna ogni caso, ne scrive i pixel in un buffer RGBA (dieci righe, nessuna libreria di immagini, nessun binario nativo) e lo passa a `zxing-wasm`, pretendendo di ritrovare **il testo e il formato** di partenza. Il formato e non solo il testo: lo stesso numero disegnato come Code 128 invece che come EAN-13 alla cassa non passa, ed è un errore che dal solo testo non si vedrebbe.

Quattordici casi, tutti passati. Il giro è stato fatto **una volta anche sul codice vero** letto dallo screenshot della prima carta importata — se il nostro disegno di quel numero si rilegge uguale, stiamo disegnando la stessa cosa che stampa l'app da cui le carte arrivano — ma quel numero **non è committato**: il repo è pubblico, e il codice di una tessera è quello che la cassa scansiona (→ ADR-0067). Il vettore che resta nei test ha la stessa forma, zero iniziale compreso, e cifre inventate. Gli altri coprono i rami sbagliabili: le due codifiche di sinistra dell'EAN-13 (le decide la prima cifra), i due sottoinsiemi del Code 128, gli zeri iniziali, la punteggiatura del Code 39. I vettori che il giro ha confermato stanno anche in `barcode.test.ts`, che gira senza WebAssembly ed è la custodia delle tabelle.

Poi la verifica è stata rifatta **sui pixel del browser**: screenshot dell'SVG disegnato dalla pagina, ridato a `zxing`. EAN-13, Code 128 con lettere e ITF a quattordici cifre si rileggono tutti, e si rilegge anche l'anteprima nel modulo di inserimento, che è alta 84 px.

E si rileggono **al caso peggiore**: schermo da 320 px, dove la tessera misura 284 e il codice 248, cioè **1,6 pixel per modulo** — sotto i due che di solito si citano come minimo, e con un solo pixel del dispositivo per pixel CSS, che su un telefono vero sono due o tre. Provati là i due formati più larghi, l'ITF a quattordici cifre (155 moduli) e il Code 39 (che ne usa sedici per carattere): letti entrambi. È la ragione per cui non si è aggiunto niente per stringere i margini a schermo stretto — la misura dice che non serve. Un codice **molto** più lungo di questi assottiglierebbe le barre oltre il punto in cui la misura è stata fatta, e allora la rete di sicurezza è il numero sotto, in cifre grandi.

Due scelte dentro gli encoder:

- **Code 128: due sottoinsiemi puri, e nessun passaggio dall'uno all'altro.** Lo standard permette di cambiare codifica a metà codice, e quello è il posto dove vivono gli errori. Qui non serve: tutte cifre e lunghezza pari vanno in **C**, che ne mette due per simbolo (tredici cifre in B misurano 178 moduli, quattordici in C ne misurano 112 — su un telefono da 390 px è la differenza fra starci e non starci); tutto il resto va in **B**. Un codice di cifre in numero dispari resta in B: più largo e giusto, invece che strettissimo e mescolato. Al lettore arriva lo stesso testo.
- **La zona di quiete è dentro il disegno**, nel `viewBox`, non un margine del CSS: se una scheda o un bordo la mangiassero, il lettore non troverebbe l'inizio del codice.
- **Nel Code 39 l'asterisco non è un carattere, è il delimitatore.** La tabella generata lo portava fra i caratteri di dato — è là che lo tiene la libreria da cui viene — e il risultato era il difetto peggiore di tutta questa famiglia: `AB*CD` **disegnava** un codice che si interrompe a metà. Le barre comparivano, sembravano buone, nessun avviso, e un decodificatore ci trovava il nulla. Sbagliato invece che assente, e lo si sarebbe scoperto alla cassa. Ora il delimitatore sta in una costante sua, dove nessun dato lo può raggiungere, e chi lo scrive nel numero legge una frase che lo dice. Era anche l'unico carattere su cui le due implementazioni delle regole divergevano.
- **Il Code 39 non ha le minuscole**, e il disegnatore le alza da sé: quindi le alza anche il dato, in `normalizeCard`. Conservandole, il numero a schermo avrebbe detto `ab12` e la cassa avrebbe letto `AB12` — la stessa classe di difetto, più silenziosa.

**Il QR non si disegna.** Vuole Reed-Solomon, cioè una libreria vera, e finché nessuna carta ne ha bisogno aggiungerla sarebbe peso per niente. `'qr'` esiste nel tipo, la tendina **non lo offre** — offrirlo farebbe scegliere una strada che finisce in una tessera senza codice — ma il formato di una carta che si sta correggendo si mostra sempre, anche se non è fra quelli offerti, perché un menù che non contiene il valore corrente lo cambierebbe da sé (→ ADR-0027). Una carta a QR si salva comunque: la tessera mostra il numero grande, e alla cassa il numero basta.

## Consequences

Il pacchetto non cresce di nessuna libreria. La parte che decide se una tessera passa alla cassa ha trenta test, gira in `node` e non chiede un browser.

Il costo è che i cinque encoder sono nostri: un formato nuovo è codice da scrivere, non un'opzione da passare. Per il QR il conto è già chiuso in favore della libreria, e quando servirà si aggiungerà solo quella.

Il giro completo dipende da `zxing-wasm`, che resta una dipendenza di sviluppo — serve comunque alla migrazione, che legge i codici dagli screenshot. Se un giorno sparisse, i vettori in `barcode.test.ts` reggono da soli: sono numeri, non chiamate.

Da ricordare per chi tocca le tabelle: **una tabella con un modulo fuori posto non produce un codice «un po' sbagliato»**, produce un codice che non si legge o che si legge diverso. Il giro completo è l'unica prova che conta, e va rilanciato.
