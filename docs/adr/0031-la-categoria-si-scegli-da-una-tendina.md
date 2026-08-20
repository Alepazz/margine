# ADR-0031: La categoria si scegli da una tendina, e se non c'è la si crea lì

**Status:** accepted · **Date:** 2026-08-20

## Context

Stamattina ADR-0026 ha stabilito che la categoria di una spesa si scegliesse da una **griglia di riquadri** con icona e testo, e il ragionamento era questo: con una tendina scegliere fra tredici voci vuole tre gesti — apri, scorri, conferma — mentre a riquadri è un tocco, e l'icona è quello che si riconosce prima del testo.

Alessio l'ha provata dal telefono e ha chiesto l'opposto: «la categoria deve essere un menù a tendina con la categoria da scegliere e come ultima voce la possibilità di creare una nuova categoria con tanto di icona».

Il mio ragionamento non era sbagliato in astratto, era **incompleto**. Tredici riquadri da 44px su uno schermo da 390px occupano sette righe: mezzo modulo, prima ancora di arrivare a come si divide la spesa. Il tocco singolo si paga in spazio, e in un modulo dove sotto la categoria ci sono altre quattro decisioni quello spazio è il costo che conta. Una tendina occupa una riga sola — e un `<option>` può contenere «🍔 Bar e ristoranti», quindi il requisito originale dell'icona è soddisfatto ugualmente.

## Decision

La categoria è una tendina, con l'emoji nel testo dell'opzione, e l'ultima voce è **`➕ Nuova categoria…`**: scegliendola compaiono due campi — icona e nome — e un pulsante «Crea e scegli» che la crea e la lascia selezionata, senza uscire dal modulo.

Quest'ultimo pezzo è la parte che vale più della forma del controllo: la categoria che manca te ne accorgi **mentre stai inserendo una spesa**, e mandare a Impostazioni in quel momento significa perdere quello che stavi scrivendo.

Anche la sottocategoria è una tendina, per la stessa ragione e per non avere due controlli diversi per la stessa domanda. `TilePicker` viene **rimosso**, con il suo CSS: un componente senza chiamanti è peso morto che il prossimo lettore deve capire prima di scoprire che non serve.

I due campi icona + nome diventano un componente condiviso, `NameFields`, perché ora servono in tre posti — questo modulo, l'editor delle categorie, il modulo del viaggio.

## Consequences

Il modulo si accorcia di circa 250px: aprendolo si arriva a vedere fino a «chi ha pagato» senza scorrere, dove prima la categoria occupava tutto lo schermo.

Il costo è un gesto in più per scegliere, tutte le volte. È il prezzo giusto qui, dove la categoria è una di sei decisioni: se il modulo servisse **solo** a categorizzare, i riquadri sarebbero la scelta migliore.

**ADR-0026 resta accepted.** La sua decisione è che il tricount si scegli una volta sola coi nomi veri, e quella vale tutta; questo ADR sostituisce solo il paragrafo sui riquadri. Resta vero anche il pezzo che dice che in un tricount di vacanza si chiedono direttamente le cinque voci di viaggio invece delle tredici categorie: cambia il controllo, non cosa contiene.

La lezione che vale oltre questo caso: **il numero di gesti non è il solo costo di un controllo.** Lo spazio che occupa lo è quanto quello, e in un modulo lungo pesa di più. Avevo ottimizzato la domanda singola invece del modulo intero.
