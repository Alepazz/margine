# ADR-0060: La testata è una coppia, e il conto si chiude da lì

**Status:** accepted · **Date:** 2026-08-27 · Supera la sola scelta di presentazione di ADR-0059

## Context

Terzo giro sulla stessa testata in un giorno, e vale la pena dire perché. ADR-0058 aveva messo il saldo in un riquadro sotto il numero grande: bocciato, «una sorta di tooltip sempre visibile». ADR-0059 gli aveva tolto il riquadro e l'aveva messo a destra, con `minmax(0, 1fr) auto`. Bocciato anche quello, e la ragione è nella parola che Alessio ha usato: **«vorrei un dualismo»**.

Con la traccia `auto`, la colonna del saldo prende solo lo spazio che le serve e si appoggia al bordo destro. Su schermo largo il risultato sono due cifre ai due estremi di una scheda vuota in mezzo: si leggono come due cose scollegate, una principale e una appesa. Non è una coppia, è un numero con un'appendice.

E il titolo non aiutava: «Con Federica» dice *con chi*, non *cosa*. «Con Federica non mi significa nulla. Dai un titolo a quella sezione.»

Terzo pezzo, che non c'entra con l'impaginazione ma arriva dallo stesso uso: se il saldo dice che c'è un debito, il gesto che segue è chiuderlo — e per farlo bisognava andare nella pagina Saldo, cioè due tocchi dopo aver già guardato il numero.

## Decision

La testata sono **due metà uguali**, divise da un filo verticale: `minmax(0, 1fr) minmax(0, 1fr)`. Nessuna delle due si appoggia a un bordo, nessuna è l'appendice dell'altra.

Il titolo di destra è **fisso** — «Il vostro saldo» — e dice cosa è il numero. Il verso lo porta il segno: `+` verde se rientrano soldi, `−` rosso se ne escono.

**Le righe delle due metà si allineano fra loro**, con `subgrid`. Senza, ogni colonna impagina per conto suo, e basta che un titolo vada a capo e l'altro no — «Puoi ancora spendere» sta su due righe a 390px, «Il vostro saldo» su una — perché le due cifre finiscano a quote diverse. Due numeri che non sono alla stessa altezza non sono una coppia: si legge prima uno e poi l'altro, che è esattamente il difetto da cui questa impaginazione nasce. Le due metà hanno lo stesso numero di righe di proposito: titolo, cifra, contorno.

**Il conto si chiude dalla testata**, col pulsante «Saldato tutto (193 €)», le stesse parole della pagina Saldo. Compare **nei due versi**, come là: se è lei ad averti pagato, il rimborso va da lei a te. Registra l'importo esatto, non quello arrotondato che il pulsante mostra.

Il costruttore del rimborso passa in `domain/settlement.ts`, perché ora serve a due pagine. Del segno dell'importo non gli importa — il verso lo dicono `debtor` e `creditor` — e questo è voluto: chi chiama ha in mano un saldo, che un segno ce l'ha già, e far dipendere la correttezza da un `Math.abs()` ricordato a memoria in ogni chiamante è il modo di spostare un debito dalla parte sbagliata senza che se ne accorga nessuno. → ADR-0019

## Consequences

Le due domande si leggono insieme, ed è quello che serviva.

Il numero grande vive ora in **metà scheda**, quindi rimpicciolisce prima: a 390px la colonna vale 154px, e «−1.384 €» — quattro cifre col segno, il caso peggiore che i dati possano dare — a `9vw` ne misurerebbe 160. La regola è `clamp(1.5rem, 7.5vw, 3rem)`, scritta su `.hero-row .hero-value` e **non** su `.hero-value`, che la pagina Saldo usa a sua volta: là il numero ha tutta la larghezza della scheda e non ha nessun motivo di stringersi.

`subgrid` è la prima dipendenza da una funzionalità CSS recente in questo progetto. Safari la supporta dalla 16, quindi sui dispositivi di casa c'è; dove mancasse, la dichiarazione cade e le due colonne tornano a impaginarsi ognuna per conto suo — brutte ma leggibili, cioè il difetto di prima e non uno peggiore.

Dentro una griglia **`justify-self` e non `align-self`**: con `align-self` il collegamento e il pulsante restavano larghi quanto la colonna, cioè mezza scheda di area invisibile che al primo tocco distratto porta altrove. Visto misurando: 469px di collegamento in una colonna da 469.

E una nota su come è stato verificato, perché è costata: il banco di prova sincronizzava il sorgente con un `rsync --exclude '/data'` copiato da un comando che partiva dalla radice del repo. Con `src/` come origine quel pattern esclude **`src/data/`**, quindi lo store non arrivava più: per cinque ore le verifiche sul foglio delle novità hanno girato su un file vecchio. È emerso solo perché una funzione mancante ha lanciato — se il difetto fosse stato di comportamento e non di esistenza, avrei certificato come funzionante del codice mai eseguito.
