# ADR-0055: Un mese che non è ancora arrivato non è un mese

**Status:** accepted · **Date:** 2026-08-27

## Context

Nei dati veri, il 27 agosto 2026, c'era una voce «Spese Modem» da 5 € datata **15 settembre 2026**. Quasi certamente un refuso sulla data, e per un importo che non interessa a nessuno.

Solo che quella voce apriva un mese di settembre nella serie mensile. `averageMonthly` esclude il mese *in corso* — è parziale, e confrontarlo con se stesso non ha senso — ma non esclude niente **dopo**: `fillMonthGaps` allunga la serie fino all'ultimo mese che compare nei dati, e i mesi vuoti in mezzo entrano nella media, che è esattamente quello che devono fare quando sono mesi vissuti a spesa bassa.

Settembre non era un mese vissuto a spesa bassa. Era un mese che non è ancora arrivato, e contava come tale:

```
media delle fisse senza il mese fantasma    [cifra rimossa]
media delle fisse come la calcolava l'app   [cifra rimossa]   (22 mesi + settembre a zero)
```

Ventun euro di fisse attese in meno, cioè ventun euro che l'app dichiarava spendibili e non lo erano — per una spesa da cinque euro sbagliata di data. E lo stesso vale per ogni altra media: `average.perMonth`, con cui il mese si confronta, e `averageByCategory`, dove l'effetto è peggiore perché il mese futuro non porta spesa ma allunga il divisore, e **tutte** le categorie risultano più leggere del vero.

E non è solo questione di medie. `extremeMonths` scarta i mesi riempiti a zero con un `count > 0`, ma un mese futuro che contiene *davvero* una spesa passa quel filtro: sui dati veri il **mese più leggero** risultava «settembre 2026, 2,50 €». Anche `fixedShareSeries` lo faceva entrare, con lo 0% di fisse.

Nessun errore, nessun avviso: solo numeri leggermente sbagliati ovunque, in una direzione sola.

## Decision

**Nessuna statistica storica guarda oltre il mese in corso.** `averageMonthly`, `averageByCategory`, `extremeMonths` e `fixedShareSeries` prendono `until`, e chi le chiama passa il mese in corso. Le righe dopo quella data cadono prima di ogni altro filtro, quindi anche prima di `lastN`: senza, una finestra mobile di dodici mesi finirebbe per prendere mesi che non sono ancora esistiti, e la media delle fisse verrebbe zero.

Tutte e quattro, non solo quelle che servivano al lavoro in corso: **Riepilogo e Statistiche calcolano medie sulla stessa serie**, e se una passa `until` e l'altra no le due pagine mostrano numeri diversi per la stessa grandezza. Misurato con un mese fantasma in mezzo: [cifra rimossa] su 22 mesi da una parte, [cifra rimossa] su 23 dall'altra.

`until` è **inclusivo** e nomina l'ultimo mese che è davvero cominciato. Che poi quel mese sia anche escluso perché parziale è una decisione diversa, e la esprime `excludeMonth`: due domande separate, due opzioni separate.

Il resto dell'app non cambia. La striscia dei mesi continua a mostrare settembre se una spesa è datata lì, e fa bene: quella spesa esiste, ed è guardandola che ci si accorge del refuso. Non si nasconde il dato — non lo si conta come storia.

## Consequences

Un dato sbagliato in un campo che nessuno controlla — la data — smette di spostare in silenzio ogni numero derivato. Resta comunque **visibile** dove serve, cioè nell'elenco delle spese e nella striscia dei mesi, così chi lo trova può correggerlo.

Il prezzo è un'opzione in più da passare, e quindi da dimenticare: un chiamante nuovo che non passa `until` torna al comportamento vecchio, e nessun tipo lo obbliga. Renderla obbligatoria avrebbe voluto dire far dipendere una funzione pura del dominio dalla data di oggi, che è il genere di dipendenza che rende i test bugiardi. Il presidio è un test che misura la differenza fra le due chiamate, non che la funzione venga chiamata bene.
