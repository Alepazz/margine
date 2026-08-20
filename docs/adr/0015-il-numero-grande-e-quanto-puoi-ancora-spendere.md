# ADR-0015: Il numero grande è quanto puoi ancora spendere

**Status:** accepted · **Date:** 2026-08-20

## Context

Il numero grande del Riepilogo era `entrate − speso`. Il 20 agosto 2026 diceva **[cifra rimossa]**, e Alessio l'ha guardato dicendo che non gli serve: *«quello dal mio punto di vista deve essere una stima di spesa, ovvero quanto posso spendere ancora»*.

Aveva ragione, e i dati lo dicono con precisione. Di quei [cifra rimossa], **471 erano affitto e bollette che non erano ancora usciti dal conto** e **300 erano l'obiettivo di risparmio**: 771 € non erano spendibili, ma il numero li presentava come tali. Peggio, la riga «circa 146 € al giorno» divideva il margine al netto del solo risparmio, ignorando le fisse in arrivo: la cifra giusta era 103.

Il modello non mancava. `projectMonth()` calcolava già `expectedFixed = max(fisse già addebitate, media storica delle fisse)`, cioè sapeva già che ad agosto mancavano 471 € di uscite dovute. Il difetto era solo che il componente metteva in grande un altro numero.

Due alternative. **Tenere [cifra rimossa] e spiegare sotto cosa è già impegnato**: intervento minimo, ma lascia in grande proprio la cifra che ha fatto storcere il naso. **Mostrare due numeri affiancati**, «in cassa» e «spendibile»: più informazione, ma due numeri grandi competono e il Riepilogo perde il singolo numero per cui l'app esiste.

## Decision

Il numero grande è lo **spendibile**:

```
spendibile = entrate − obiettivo di risparmio − fisse attese − variabili già spese
```

Le fisse attese sono `projection.expectedFixed`, quindi comprendono anche quelle che devono ancora arrivare. Il residuo in cassa resta, declassato a una riga di dettaglio.

Il misuratore cambia grandezza insieme al numero: non più «speso su entrate», ma **variabili spese sul fondo discrezionale** (`entrate − risparmio − fisse attese`). Le entrate non sono un limite di spesa — comprendono soldi che non sono mai stati spendibili.

Il conto si mostra **riga per riga** nella scheda, con due decimali. Un numero più piccolo di quello che uno si aspetta deve poter essere verificato una riga alla volta, e con due decimali la colonna somma esatta invece di sbagliare di un euro per arrotondamento.

Il riferimento stagionale è **lo stesso mese dell'anno prima**, non una media di quel mese: i dati partono da ottobre 2024, quindi per ogni mese di calendario esiste un solo anno precedente (per settembre nemmeno quello). Chiamarla «media» sarebbe una media di uno.

Il semaforo **non si tocca**. Si dimostra che non serve: dalle definizioni, `spendibile < 0` implica `spesa proiettata > entrate − risparmio`, che è già la soglia dell'avviso. Quindi il semaforo non può dire «sotto controllo» mentre lo spendibile è negativo, e aggiungere un controllo sarebbe codice che non cambia mai risposta.

## Consequences

Il numero grande diventa più piccolo e smette di mentire: ad agosto passa da 1903 a [cifra rimossa], e la spesa giornaliera da 146 a 103. E **i mesi passati non si muovono di un centesimo**, perché a mese chiuso `expectedFixed` è uguale alle fisse davvero addebitate e la formula collassa in `entrate − speso − risparmio`, che era già il margine al netto del risparmio. Un test presidia quell'uguaglianza.

In cambio lo spendibile **eredita l'incertezza della media storica delle fisse**. In un mese con una fissa fuori dall'ordinario — un conguaglio, un'assicurazione annuale — la media sottostima l'impegno vero e lo spendibile risulta più generoso del dovuto, finché quell'uscita non compare nei dati. È lo stesso limite che la proiezione ha sempre avuto, ma ora pesa sul numero principale.

E il netto in busta conta di più: sottrarre risparmio e fisse da un'entrata stimata concentra l'errore su un numero più piccolo. Finché lo stipendio netto in `data/config.json` resta una stima ricavata dalla RAL, lo spendibile è indicativo quanto quella stima.
