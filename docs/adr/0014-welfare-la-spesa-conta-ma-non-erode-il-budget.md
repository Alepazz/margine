# ADR-0014: Il welfare aziendale: la spesa conta, ma non erode il budget

**Status:** accepted · **Date:** 2026-08-19

## Context

Alessio ha due entrate che non passano dal conto e che non traccia: i buoni pasto e il welfare aziendale. La regola coerente per le entrate è semplice — **un'entrata entra nel calcolo se e solo se ciò che paga è tracciato come uscita** — e per i buoni pasto funziona: pagano pranzi di lavoro che non finiscono in nessun tricount, quindi restano fuori da entrambi i lati e il conto torna.

Il welfare no. Con il welfare Alessio paga cose che **finiscono nei tricount**: il ristorante stellato della Costiera (571 €), gli alloggi, i voli. Su quelle voci il tricount registra correttamente la spesa e la divisione a metà, e poi Federica gli rimborsa la sua quota in contanti. Il risultato, per lui: dal conto non è uscito niente, e sono anzi entrati i soldi della quota di lei.

Margine invece conta la sua quota come uscita, e quindi gli mangia il margine di quei mesi con soldi che non ha speso. Sui dati importati sono circa 1.373 € della sua quota su sette voci. L'effetto è in parte mascherato dal fatto che le vacanze stanno già fuori dalle statistiche mensili (ADR-0010), ma non scompare: appare nella vista «Con vacanze», e comparirebbe in pieno il giorno in cui il welfare paga qualcosa che non è un viaggio.

Tre strade. **Mettere il welfare fra le entrate**: aritmeticamente torna, ma è una bugia comoda — quei soldi non sono spendibili come uno stipendio, e nel mese dell'acquisto il margine sarebbe comunque sbagliato perché l'entrata è spalmata su dodici mesi mentre la spesa cade tutta in uno. **Non importare quelle spese**: si perderebbe il costo vero di una vacanza e la riconciliazione con Tricount. **Marcare la singola spesa.**

## Decision

Una spesa può portare `welfare: true`. La spesa resta intera dove racconta un fatto — il costo di una vacanza, l'elenco delle spese, il 730, la riconciliazione con Tricount — e **non erode il budget del mese di chi l'ha anticipata**.

L'esclusione è **per persona, non assoluta**: vale solo per `paidBy`. Per l'altra persona la sua quota resta un'uscita normale, perché quella la rimborsa in contanti davvero. Il filtro sta in `fundedByWelfare()` e viene applicato una volta sola, in `visibleFor()`, che è il perimetro delle statistiche mensili.

Il flag è un'**annotazione**, come il tag 730: si mette dall'app toccando la spesa, viene committato nel repo via API GitHub (ADR-0005) e sopravvive agli import. Non si ricava da una regola sull'importo o sulla categoria, perché non c'è niente nel dato che distingua un ristorante pagato col welfare da uno pagato con la carta: lo sa solo chi ha pagato. Il comando compare solo sulle spese anticipate dalla persona che sta guardando.

Nel dettaglio di un viaggio compare «pagato col welfare, non di tasca», e lì il numero è **solo la quota di chi ha anticipato**: il welfare copre tutto il conto, ma la metà dell'altra persona rientra in contanti, quindi contarla come risparmio sarebbe contarla due volte.

## Consequences

Il margine mensile torna a misurare quello che misura, cioè i soldi che escono dal conto, senza perdere il costo reale delle vacanze. E la stessa spesa può essere due cose diverse per due persone senza contraddizione, che è la conseguenza più utile: nel modello a due quote di ADR-0007 mancava un modo per dire «per te sì, per me no».

Il costo è che il flag **va messo a mano**, spesa per spesa. Nessuna validazione può accorgersi che manca: una voce pagata col welfare e non marcata è indistinguibile da una pagata di tasca, e continua a erodere il budget in silenzio. Chi guarda un margine peggiore del previsto in un mese di acquisti col welfare deve ricordarsi di questa casella.

Resta una imprecisione dichiarata: i soldi che Federica rimborsa sono un'entrata reale che l'app non conta. Nei mesi in cui succede il margine vero è **migliore** di quello mostrato, della quota di lei. Modellarlo richiederebbe i trasferimenti fra le due persone, cioè rifare Tricount dentro Margine — e Tricount ce l'abbiamo già.
