# ADR-0059: Il saldo è la seconda colonna della testata

**Status:** accepted — la sola scelta di *presentazione* (colonna a destra dimensionata sul contenuto, senza pulsante) è superata da ADR-0060 · **Date:** 2026-08-27 · Supera la sola scelta di presentazione di ADR-0058

## Context

ADR-0058 ha deciso *che* il saldo con l'altra persona sta nella scheda del margine, e resta valido: è uno stato e non una statistica del mese, non passa da `visibleFor()`, non tocca il margine. Ha deciso anche *come* mostrarlo — un riquadro con bordo e sfondo, sotto il semaforo, con tre righe: etichetta, cifra, e una frase che dice il verso («te li deve»).

All'uso quella forma è sbagliata, e Alessio l'ha detto vedendola: «questa parte fa abbastanza schifo […] quello che mi deve Federica o quello che devo io a lei è una sorta di tooltip sempre visibile. Non mi piace affatto».

Ha ragione, e si può dire perché. Il riquadro con bordo e sfondo è la forma di un *avviso*: qualcosa che compare quando c'è qualcosa da segnalare. Il saldo invece c'è sempre. Messo sotto il numero grande e accanto al semaforo, per giunta, chiedeva di essere letto **dopo** — mentre è un'informazione dello stesso rango.

## Decision

La testata della scheda diventa **due colonne parallele**: «Puoi ancora spendere» a sinistra, «Con Federica» a destra, ciascuna con la sua etichetta piccola sopra e la sua cifra sotto. Stessa impaginazione, perché sono due risposte allo stesso genere di domanda — «come sto col mese?» e «come sto con lei?».

Niente riquadro, niente frase sotto: **il segno è il messaggio**. `+[cifra rimossa]` in verde vuol dire che rientrano soldi, `−[cifra rimossa]` in rosso che ne escono. La frase «te li deve» diceva a parole quello che il segno dice già, e a chi non distingue i colori il `+` resta comunque leggibile: il colore rinforza, non porta da solo.

La cifra del saldo è **più piccola** di quella del margine. Due numeri della stessa taglia competono, e ADR-0015 ha deciso che il Riepilogo ne mette in grande uno solo.

Il **semaforo scende sotto**, appena sopra la barra: è un commento alla barra — dice come sta andando il mese — non un'etichetta del numero.

La riga è una **griglia** con tracce `minmax(0, 1fr) auto`, non un flex che avvolge. In flex la prima colonna prende come larghezza di partenza il proprio contenuto, e il suggerimento «[cifra rimossa] al giorno da qui a fine mese (4 giorni)» ha un min-content di 304px contro 324 disponibili: bastava a mandare il saldo a capo. È lo stesso difetto di ADR-0044, dove una traccia dichiarata `1fr` si allargava al suo contenuto.

## Consequences

Le due informazioni si leggono in un colpo d'occhio, e nessuna delle due sembra un avviso.

La colonna del numero grande si è dimezzata, e questo ha un prezzo misurato: a 320px vale 135px, e «−[cifra rimossa]» a `2.1rem` ne misurava **136** — un pixel, e il numero andava a capo lasciando il simbolo dell'euro da solo sulla seconda riga. Il minimo del `clamp` scende quindi a `1.8rem`, che morde solo sotto i ~372px di viewport: sopra vince `9vw` e non cambia niente. Chi in futuro alzasse quel minimo rimetterebbe il difetto, su uno schermo che non ha sotto gli occhi.

Quella stretta è scritta su `.hero-row .hero-value` e non su `.hero-value`, che la pagina Saldo usa a sua volta: là il numero ha tutta la larghezza della scheda e non ha nessun motivo di rimpicciolirsi. Una modifica fatta per una pagina non deve cambiarne un'altra in silenzio.

Il limite noto, misurato invece che dedotto: la seconda traccia è `auto`, quindi un saldo lungo si prende larghezza dalla prima. A 320px, con il numero grande a «−[cifra rimossa]», la colonna di sinistra vale 135px con un saldo di tre cifre, 125 con uno di quattro — e in tutti e due i casi il numero resta su una riga. Si spezza solo con un saldo a **cinque cifre**, cioè da 10.000 € in su, che fra due persone che si dividono la spesa non succede. Chi ci arrivasse davvero lo vedrebbe subito, ed è meglio di una macchina che tiene tracce e caratteri in equilibrio per un caso che non esiste.

Il saldo compare **anche senza profilo entrate compilato**. Nella prima versione il ramo «margine sconosciuto» tornava la sola colonna di sinistra e portava via anche il saldo, che con le entrate non c'entra: visto sul banco nella vista di chi non ha compilato il profilo, cioè la situazione di chiunque apra l'app la prima volta.

Nel farlo è tornato a mancare un difetto che il progetto aveva già risolto una volta: «Devi [cifra rimossa] **a** Alessio». La d eufonica stava in una funzione dentro `Saldo.tsx`, invisibile da qualunque altro posto. Ora `aTo()` sta in `domain/text.ts` con i suoi test, perché una regola di lingua italiana non è di nessuna pagina in particolare.
