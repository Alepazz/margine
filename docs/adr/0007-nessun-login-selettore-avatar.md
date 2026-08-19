# ADR-0007: Nessun login: si sceglie la persona con un avatar

**Status:** accepted · **Date:** 2026-08-19

## Context

Le statistiche vanno lette «dalla parte di chi guarda»: una cena da 60 € divisa a metà pesa 30 € nel margine di Alessio. Un domani anche Federica potrebbe consultare le sue — oggi si ha evidenza solo delle spese condivise, non delle sue personali.

L'app non ha un backend (ADR-0002) e i dati sono già protetti dalla cifratura (ADR-0003): chi arriva alla schermata sbloccata ha già la passphrase, quindi ha già accesso a tutto. Un login sopra non proteggerebbe niente in più, aggiungerebbe utenti, sessioni e stato da gestire.

## Decision

**Nessuna autenticazione.** Un selettore a due avatar in alto: si tocca la persona e tutte le statistiche si ricalcolano sulla sua quota. La scelta si ricorda sul dispositivo.

Nel modello dati questo si traduce in `shares: { me, partner }` su ogni spesa — la quota di ciascuno in euro — invece di un solo campo «la mia quota». Le due quote sommano sempre esattamente all'importo, ed è la validazione a garantirlo.

## Consequences

Zero attrito: nessuna registrazione, nessuna password oltre quella dei dati, e Federica può guardare le sue quote sul telefono di Alessio senza fare niente. Il giorno in cui vorrà tracciare anche le sue spese personali, basta aggiungerle come sorgente: l'architettura è già a due persone.

In cambio: l'app **non può nascondere nulla a nessuno dei due**. Chi ha la passphrase vede entrambe le colonne, incluse le spese personali dell'altro. Va bene qui — è una scelta di coppia, dichiarata — ma è il vincolo da ricordare se un domani i dati diventassero tre.

Il modello a due quote esplicite ha un costo: ogni voce importata deve dichiarare la ripartizione, e non basta più sapere «era 50/50».
