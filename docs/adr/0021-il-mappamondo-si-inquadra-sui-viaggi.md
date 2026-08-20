# ADR-0021: Il mappamondo si inquadra sui viaggi

**Status:** accepted · **Date:** 2026-08-20

## Context

Alessio ha riferito che i puntini del mappamondo «non sembrano cliccabili». Il tocco funzionava: la prova in pagina apriva il viaggio giusto. Il difetto era altrove, ed erano tre difetti sovrapposti che davano lo stesso sintomo.

Il primo, e il vero: **a zoom 1 i suoi cinque viaggi cadono in un fazzoletto di 48×70 pixel** su un disco da 304, perché stanno tutti in Europa. Ortona e Sud Italia distano **8 pixel** — meno del raggio di un puntino, quindi i due dischi si sovrappongono fisicamente — e Germania e Parigi 15. Con un bersaglio da 20 pixel ogni tocco ne trova tre o quattro e sceglie il più vicino: mirare è impossibile. ADR-0020 aveva registrato che i viaggi stavano in duemila chilometri e che la faccia utile sarebbe stata una sola; non aveva tirato la conseguenza, cioè che a quella scala i puntini si toccano.

Il secondo: **il dettaglio del viaggio si apre 1046 pixel sotto il globo**, fuori da uno schermo da 844. Toccare un puntino non cambiava niente di visibile. È lo stesso difetto che Alessio aveva già segnalato sul grafico dell'andamento mensile — «cambia dei valori che sono più in basso, non molto intuitivo» — ricomparso in una pagina nuova.

Il terzo: **un disco con dei pallini muti non si legge come un elenco di posti.** Niente diceva che un puntino fosse roba da toccare, né quale si stesse toccando.

## Decision

L'inquadratura di partenza **stringe sui viaggi** invece di mostrare mezzo mondo. `fitMarks()` trova il baricentro dei posti — passando per i vettori sulla sfera, perché la media delle longitudini sbaglia di mezzo mondo a cavallo del meridiano 180 — e scegle l'avvicinamento che porta il posto più lontano al 62% del raggio. Avvicinare in ortografica vuol dire ingrandire la sfera lasciando fermo il disco: si vede una calotta più piccola, e il disegno si taglia sul cerchio. Sui cinque viaggi veri l'avvicinamento viene 4,1× e la distanza minima fra due puntini passa **da 8 a 33 pixel**.

Il limite è largo (12×) perché serve: cinque viaggi in Europa hanno bisogno di arrivare a quattro o cinque volte prima di staccarsi. Chi vuole tornare a vedere il mondo intero ha il pizzico, la rotella e tre pulsanti — perché il pizzico non esiste col mouse e non si raggiunge con la tastiera.

**Ogni puntino porta il suo nome accanto.** Il posto si cerca fra quattro candidati e chi arriva dopo cede: due nomi sovrapposti sono peggio di un nome mancante. Il selezionato chiede per primo, così il suo non manca mai. Il puntino aperto si accende della tinta d'accento con un anello intorno, e sul Mac il cursore diventa una mano quando passa sopra un bersaglio.

**Toccare un puntino porta il dettaglio a vista**, con uno `scrollIntoView` — ma solo se non è già dove si sta guardando, altrimenti la pagina saltella a ogni tocco. La distanza dalla testata appiccicata la dichiara il CSS con `scroll-margin-top` sulla classe `scroll-target`: è l'unico posto che sa quanto è alta la testata.

## Consequences

Il globo diventa usabile con dei dati veri, e resta corretto con dati diversi: un viaggio a Tokyo il giorno che ci sarà allargherà l'inquadratura da sé, e posti sparsi su più di mezzo mondo ricadono sul mondo intero invece di nasconderne metà.

Il prezzo è che **la faccia visibile è più piccola del disco**: quello che cade fuori non si disegna e non si può toccare, quindi avvicinandosi si perdono di vista gli altri puntini senza che niente dica che esistono. Il pulsante di reinquadratura li riporta, ma è una cosa da sapere.

Il contorno delle terre è a 110m, cioè il livello scelto in ADR-0020 per un disco a zoom 1. A 4× resta riconoscibile — l'arrotondamento a un decimo di grado vale meno di un pixel a quella scala — ma la **forma** è grossolana. Passare a 50m costerebbe circa tre volte il peso del dato: non si fa fino a quando qualcuno se ne lamenta.

Il test che presidia tutto questo non misura l'avvicinamento, misura **la distanza minima fra due puntini** con le cinque coordinate vere: è la grandezza che descrive il difetto, e resta vera se un giorno la formula dell'inquadratura cambia. Accanto c'è il suo gemello che dimostra il difetto senza inquadratura, così il motivo per cui il codice esiste non si perde.
