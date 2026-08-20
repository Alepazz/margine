# ADR-0018: L'app scrive le spese, non solo le annotazioni

**Status:** accepted · **Date:** 2026-08-20

## Context

Alessio vuole aggiungere le spese dal telefono — *«mi piacerebbe che diventasse come Tricount»* — e nel lungo periodo sostituire Tricount, almeno per le personali.

Sembrava un cambio di architettura e non lo è. ADR-0005 aveva già dato all'app una via di scrittura per le annotazioni 730, e quella via **scrive già il dataset intero**: `store.tsx` scarica `expenses.json.enc` dal repo, lo decifra, applica le modifiche, lo ricifra e lo committa, con lo `sha` come controllo di concorrenza e un tentativo di merge sul conflitto. Aggiungere una spesa è la stessa operazione con un merge diverso. E i viaggi vivono nello stesso file (`Dataset { expenses, trips }`), quindi anche creare un viaggio nuovo non richiede niente di nuovo.

Il vincolo che restava era la coda locale: era tipizzata come una lista di annotazioni, `OutboxEntry extends Annotation`. Una spesa nuova non è una patch su qualcosa che esiste.

Due fatti dai dati hanno deciso la forma del modulo. Primo: in due anni, fuori dalle vacanze, esistono **solo tre divisioni** — 100% sua (397 voci), 100% di Federica (21), metà e metà (667), e nessun'altra. Secondo: le 370 spese `personali` sono **tutte** al 100% di Alessio, nessuna divisa.

## Decision

La coda diventa un **registro di operazioni** — `patch`, `create`, `update`, `delete`, `trip` — applicate in ordine di tempo. La chiave in `localStorage` passa a `margine.outbox.v2` e le voci della v1 vengono convertite in `patch`: senza la conversione, le annotazioni ancora in attesa su un dispositivo sparirebbero al primo caricamento.

Si può **correggere e cancellare qualunque spesa**, anche le 1253 importate. La scelta alternativa — rendere intoccabile lo storico riconciliato — creava due classi di spese che si comportano in modo diverso senza che si veda perché; e un importo sbagliato battuto al supermercato deve poter essere corretto sul posto, non dal portatile.

La divisione si sceglie con **tre pulsanti più «a mano»**, invece di due caselle che devono sommare all'importo. I preset parlano dal punto di vista di chi guarda l'app, mentre `shares` ha due chiavi fisse: la traduzione sta in un posto solo (`sharesFor`), perché è l'errore più facile da fare e il più silenzioso. Per le spese `personali` la divisione non si offre affatto: è al 100% di chi la inserisce.

Le regole di validità hanno una **seconda implementazione nel browser** (`domain/expense-rules.ts`), come la cifratura ha la sua. Un test prova che concordano, in una direzione sola: **ciò che l'app accetta, l'import lo accetta senza errori.** Il contrario non vale di proposito — l'import tollera con un avviso un importo a zero, un modulo di inserimento non deve permetterlo.

Gli id delle spese create dall'app hanno **lo stesso formato di quelli dell'import** (`AAAA-MM-GG` più otto cifre esadecimali casuali). Non c'è nessun campo che dica «questa l'ha scritta l'app»: non serve a nulla, perché tutto è modificabile, e l'import salta gli id che già conosce, quindi una voce aggiunta dal telefono sopravvive ai reimport.

L'import guadagna un **controllo anti-doppione**: una voce in arrivo con lo stesso importo al centesimo, la stessa origine e una data che dista al massimo un giorno da una già presente non entra, e viene elencata con la sua gemella. `npm run import -- --doppie` la fa entrare comunque.

## Consequences

L'app diventa usabile ogni giorno, e per le spese personali sostituisce Tricount da subito: lì non c'è nessun saldo da calcolare e nessuna seconda persona.

Il prezzo più concreto è il **doppio inserimento**. Finché Tricount resta in uso per le condivise, la stessa cena può arrivare due volte con due titoli diversi, e gli id non se ne accorgono. Il controllo all'import lo intercetta, ma è euristico: due caffè da 1,20 in due giorni consecutivi verranno segnalati come sospetti pur essendo diversi, e andranno reimportati con `--doppie`. Il caso opposto — due spese identiche davvero avvenute lo stesso giorno — resta possibile, e lì il controllo perde una voce, che si vede però nella riconciliazione dei totali col tricount.

Il secondo prezzo è che ogni scrittura riscrive **tutto** il file cifrato: 358 kB per aggiungere una riga da 40 €. A milleduecento spese non è un problema, e la concorrenza è già gestita; a diecimila lo diventerebbe, e allora servirebbe spezzare il dataset per anno. Non oggi.

Resta fuori il pezzo per cui Tricount esiste: **il saldo fra le due persone**. Registrare le spese non dice chi deve cosa a chi, e finché quel numero vive su Tricount la sostituzione non è compiuta. → ADR-0019
