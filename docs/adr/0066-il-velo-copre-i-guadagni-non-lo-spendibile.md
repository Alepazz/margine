# ADR-0066: Il velo copre quanto guadagni, non quanto puoi spendere

**Status:** accepted · **Date:** 2026-08-28 · Restringe la portata di ADR-0016 e supera la sua conseguenza sulla barra

## Context

ADR-0016 aveva coperto tutto ciò da cui le entrate si ricavano: margine, spendibile, obiettivo di risparmio, e la barra per intero, perché «le proporzioni **sono** i numeri». Il ragionamento era corretto e la conclusione inservibile. Alessio, otto giorni dopo: «Entrate del mese, così come tutti i riferimenti ai miei guadagni, devono essere oscurati di default, cosicché io possa mostrare l'app ad amici senza fargli vedere quanto guadagno. Ad oggi invece nasconde un po' troppo, come "Puoi ancora spendere" e "Da mettere da parte" e anche la barra di progressione».

Il difetto è che il velo si attivava **proprio nel momento in cui serve** — mostrare l'app a qualcuno — e in quel momento spegneva l'app. Il numero grande diventava `•••`, la barra un rettangolo grigio, il conto una colonna di puntini: quello che restava da mostrare era un elenco di spese. Un velo che, per essere utile, va tolto prima di usarlo, resta spento.

Il prezzo di toglierlo è reale ed è stato posto ad Alessio prima di scrivere una riga: il conto del Riepilogo è una sottrazione, e lasciandone visibili le ultime quattro righe la prima si ottiene sommandole.

```
Entrate del mese        •••        ← 300 + 653 + 331 + 1384
Da mettere da parte    − 300 €
Spese fisse attese     − [cifra rimossa]
Variabili già spese    − [cifra rimossa]
Puoi ancora spendere    [cifra rimossa]
```

La sua risposta: «È ovvio che il buco si chiude sommando ma intanto deve fare la somma e poi non è detto che il totale corrisponda effettivamente alle mie entrate del mese». Il secondo argomento è il più solido, ed è un fatto del progetto: il profilo entrate è una **stima dalla RAL**, marcata come tale nel campo `note`. Chi somma non ottiene una busta paga, ottiene un modello.

## Decision

Il velo copre **quanto guadagni**, non **quanto puoi spendere**.

Restano coperti i guadagni nudi (`income`, `breakdown`) e tutto ciò che è «entrate meno qualcosa» (`margin`, `marginAfterSavings`, `projectedMargin`, `projectedMarginAfterSavings`, `discretionaryBudget`, `usedPct`): quelli non chiedono una somma a chi guarda, basta leggerli. Tornano visibili lo spendibile, lo spendibile al giorno, l'obiettivo di risparmio e la barra.

**E l'oscuramento diventa il valore di partenza.** Le due cose sono una decisione sola e non due: è perché il velo è sempre acceso che deve lasciare l'app leggibile, ed è perché lascia l'app leggibile che può stare sempre acceso. Separarle darebbe due ADR ognuno dei quali spiega metà del perché. L'assenza della chiave in `localStorage` vale «coperti», e anche il ripiego quando lo storage non risponde: il difetto ha due versi che non si equivalgono — partire in chiaro mostra lo stipendio a chi ti guarda lo schermo prima che tu ci pensi, partire coperti costa un tocco.

**La barra si compone senza mai nominare le entrate.** Il suo fondo erano `max(entrate, impegnato)`; ora è `impegnato + max(0, spendibile)`, che è la stessa identica misura — lo spendibile *è* entrate meno impegnato — scritta con i soli campi pubblici. Non è un aggiramento del velo: è la constatazione che quella misura non aveva mai avuto bisogno delle entrate. Un test pretende che la barra venga **identica** coperta o scoperta, perché se un giorno divergesse vorrebbe dire che una delle due strade ha smesso di essere la definizione dell'altra.

Il totale della barra in euro non esce dall'albero di accessibilità: `aria-valuemax` è `100` e `aria-valuenow` la percentuale impegnata. Un lettore di schermo che annunciasse «[cifra rimossa]» direbbe ad alta voce il numero che la pagina si rifiuta di stampare.

## Consequences

Il velo protegge dallo sguardo, non dall'aritmetica — la stessa distinzione, e le stesse parole, con cui ADR-0039 descrive la separazione dei compartimenti personali. È scritto in Impostazioni insieme all'altro limite già dichiarato (la pastiglia del semaforo regala una soglia), perché fra sei mesi il ricordo sarà «i guadagni sono nascosti» e non «sono nascosti a chi guarda».

Cade la conseguenza di ADR-0016 sulla barra. Non cade il suo meccanismo, che è la parte che vale: si azzerano i campi in `marginView()` invece di velare i numeri nel componente, e `PUBLIC_MARGIN_FIELDS` resta una lista di **ciò che si vede** — un campo nuovo in `MarginResult` nasce coperto. Il test che la riscrive a mano ha fatto esattamente il suo lavoro: allargando la lista sono caduti due test, e questo ADR è la decisione che erano lì a pretendere.

Da ricordare, perché è controintuitivo: ora è possibile aggiungere al Riepilogo un numero che rivela le entrate **senza** che nessun test se ne accorga, se lo si compone in un componente a partire da campi pubblici. La lista protegge i campi, non le somme. L'unico presidio è la domanda, da farsi ogni volta: questo numero dice quanto guadagno, o quanto posso spendere?
