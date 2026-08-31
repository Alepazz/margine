# ADR-0078: Il velo si accende per sempre e si spegne per un momento

**Status:** accepted · **Date:** 2026-08-31

## Context

Il velo sui guadagni ha due comandi: il tocco sul numero grande (e il gemello «Nascondi» accanto al Profilo entrate), che valeva **solo per la sessione**, e un selettore in Impostazioni → Privacy, che decide come parte l'app e resta.

La ragione scritta nel codice era questa:

> Il tocco non si ricorda: se si ricordasse, la prima volta che scopri il numero resteresti scoperto per sempre, che è l'opposto di quello che serve.

L'argomento è giusto e riguarda **una** delle due direzioni. Applicato a tutte e due produce il difetto che Alessio ha segnalato: «vorrei che il fatto che alcune voci sono nascoste per scelta fosse definitiva, e non che debba cliccare ogni volta su Nascondi». Con il selettore su «In chiaro», ogni apertura dell'app ripartiva scoperta e il gesto andava rifatto — un gesto che si fa spesso, mentre quello che lo rendeva permanente stava in un'altra scheda e non si trovava.

C'era anche una seconda cosa che non tornava: due controlli per la stessa cosa, di cui quello che si incontra per primo non fa la cosa che sembra fare.

## Decision

I due gesti smettono di essere l'uno il contrario dell'altro.

**Nascondere è una decisione, e si ricorda**: il tocco sul numero grande e il pulsante «Nascondi» scrivono anche il valore di partenza, quindi da lì in avanti l'app apre coperta.

**Scoprire è un atto momentaneo, e non si ricorda**: giri lo schermo verso qualcuno, gli mostri il numero, e alla riapertura è di nuovo coperto. È esattamente lo scenario per cui il velo esiste (→ ADR-0066), e ricordarlo lascerebbe l'app in chiaro per sempre dopo la prima occhiata.

Per restare scoperti resta il selettore in Impostazioni → Privacy: **il gesto raro sta in un posto raro**. Non è un doppione del tocco, è l'unica strada per l'altra direzione.

Le etichette lo dicono, invece di lasciarlo indovinare: «Nascondi i guadagni, anche alle prossime aperture» contro «Mostra i guadagni, per questa sessione». E in Impostazioni la conferma è visibile senza messaggi: premendo «Nascondi» il selettore della scheda Privacy, una scheda più sotto, si sposta da sé su «Oscurati».

Non cambia niente di ADR-0066: cosa il velo copre, e il fatto che parta acceso quando nessuno ha scelto, restano quelli. Qui cambia solo cosa succede quando qualcuno sceglie.

## Consequences

Il gesto frequente fa la cosa che uno si aspetta, e quello che serviva a renderlo permanente smette di essere una scoperta.

Il prezzo è un'asimmetria, che è sempre una cosa da spiegare: un pulsante che a premerlo due volte non riporta il mondo dove stava. Sta scritta in tre posti che devono restare d'accordo — il commento su `toggleHideIncome`, le due etichette del numero grande, e la copia della scheda Privacy.

**Non c'è un test.** Servirebbe un'impalcatura per React e `localStorage` che il progetto non ha, com'è già dichiarato per `flush` (→ ADR-0070). La verifica è stata fatta nel browser, in cinque passi: partenza con la chiave a `off` e app in chiaro; «Nascondi» → coperta e chiave a `on`; ricarica → **ancora coperta**; «Mostra» → scoperta e chiave **ancora** `on`; ricarica → coperta di nuovo. Il presidio, finché non c'è un test, è quella sequenza scritta qui.
