# ADR-0073: I parametri dell'envelope si controllano, non si accettano

**Status:** accepted · **Date:** 2026-08-28

## Context

Un file cifrato di Margine si descrive da sé: porta dentro salt, iterazioni e IV, ed è ciò che gli permette di restare apribile domani se un giorno alziamo il costo della derivazione (→ ADR-0003). `isEnvelope` però guardava solo i **tipi**: qualunque numero passava per `iterations`, e `kdf.name`, `kdf.hash` e `cipher.name` non erano guardati affatto. Un file con `hash: 'SHA-1'` e una sola iterazione era, per l'app, un envelope valido.

Quei parametri non servono solo a leggere. Il flush **ricifra riusando la `kdf` del file scaricato**, quindi un valore accettato una volta diventa il valore con cui si scrive da quel momento in avanti, su ogni dispositivo, per sempre — niente lo confrontava con un minimo.

Cosa **non** è possibile, e va detto perché è la parte fatta bene: un estraneo non può declassare niente. AES-GCM autentica, quindi un ciphertext che non sia stato prodotto con la chiave vera fa fallire `decryptEnvelope` **prima** che si arrivi a ricifrare. Verificato.

Cosa è possibile: chi ha **passphrase e token insieme** — le due persone del progetto, o chi rubasse entrambe (e stanno nello stesso `localStorage`, sulla stessa origine) — scrive una volta il file con `iterations: 1`. Da quel momento il ciphertext **pubblico** è forzabile in tempo zero, e nessuna passphrase, per quanto forte, conta più niente (→ ADR-0072). Dall'altro capo, `iterations: 1e9` inchioda l'apertura per minuti su un telefono: non è un furto, è un'app che non si apre.

## Decision

`isEnvelope` pretende i parametri che Margine scrive davvero: `kdf.name === 'PBKDF2'`, `kdf.hash === 'SHA-256'`, `cipher.name === 'AES-GCM'`, salt di 16 byte, IV di 12, e `iterations` intero fra **100.000** e **5.000.000**.

Il pavimento è più basso del valore di produzione (600.000) di proposito: è il limite sotto cui nessuna versione del progetto ha mai scritto, non il valore corrente. Serve a lasciare spazio a un file vecchio senza lasciare spazio a un file ostile — e tutte e trentanove le versioni storiche stanno a 600.000 con salt da 16 byte e IV da 12, controllate una per una prima di scrivere il limite, perché un controllo troppo severo avrebbe chiuso Alessio fuori dai suoi dati.

Lo stesso controllo sta anche nell'implementazione Node (`assertEnvelope` in `crypto-node.mjs`), usato da `npm run decrypt`. Le due implementazioni scrivono lo stesso formato, quindi devono rifiutare le stesse cose: una divergenza nella severità è una divergenza. Il lato Node lancia invece di tornare un booleano, perché uno script ha un solo modo utile di reagire — fermarsi e dire quale campo non torna.

Scartata l'idea di un messaggio d'errore dedicato («è un envelope, ma con parametri strani»). Un file fuori da questi limiti **non** è un envelope di Margine: nessuna versione del progetto ne ha scritto uno così, quindi «non è un file cifrato di Margine» dice il vero, ed è la frase che l'app già mostra.

## Consequences

**Un file manomesso non si apre e lo dice**, invece di aprirsi e diventare permanente. Il caso peggiore è che qualcuno con passphrase e token scriva un file legittimo ma al pavimento, 100.000: resta cinque volte più debole del dovuto e nessun controllo lo segnala. È il residuo accettato — chiudere anche quello vorrebbe dire pretendere esattamente 600.000, e allora un file scritto prima di un futuro innalzamento non si aprirebbe più.

**Il test della parità fra le due implementazioni usa il pavimento**, non più mille iterazioni: è più lento di prima di poco (la suite resta sotto il secondo) e ha smesso di provare il formato con un valore che l'app rifiuterebbe. Chi alzasse il pavimento senza pensarci lo trova rosso.

**Otto test descrivono i rifiuti**, uno per parametro, e uno pretende che un envelope a 600.000 iterazioni resti valido: è la riga che garantisce che il controllo non chiuda nessuno fuori dai propri dati.

**Non copre l'altro verso.** Se un giorno il valore di produzione dovesse salire oltre 5.000.000, il tetto va alzato insieme — ed è un tetto scritto in due file, che devono cambiare insieme come già fanno le altre costanti del formato.
