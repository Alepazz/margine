# ADR-0057: La barra del Riepilogo è il mese intero

**Status:** accepted · **Date:** 2026-08-27 · Supera la sola scelta del misuratore in ADR-0015

## Context

Il 27 agosto 2026 Alessio ha registrato l'affitto e si è trovato oltre il mese. Le sue parole: *«mi sono trovato ad aver sforato il mese, mentre non me lo sarei aspettato ma mi sarei aspettato che quella spesa fosse già contata in precedenza»*.

Il modello **la contava già**. `expectedFixed` sconta le fisse dal primo giorno del mese, quindi registrare l'affitto non muove lo spendibile di un centesimo — verificato sui dati veri e ora presidiato da un test. Quel giorno però l'affitto era stato inserito **senza la spunta «ricorrente»**, quindi non era una spesa fissa: era finito fra le variabili, in aggiunta alla media delle fisse già sottratta. Pagato due volte, e lo spendibile da +419,73 € a −24,27 €. Differenza 444,00 €, la sua quota al centesimo.

Ma la spunta dimenticata è solo l'innesco. La domanda vera è perché il meccanismo non fosse visibile, e la risposta sta in una scelta di ADR-0015: il misuratore era il rapporto fra **variabili spese** e **fondo discrezionale**. Diceva il vero ed era la grandezza giusta per «quanto mi resta da spendere», ma risparmio e fisse stanno *fuori* da quel fondo per costruzione — non c'era posto per mostrarli. Chi guardava la barra non vedeva mai i 300 € da mettere da parte né i 539 € di fisse: vedeva solo il pezzo di mese in cui poteva ancora decidere. L'affitto sembrava arrivare dal nulla il giorno che compariva.

## Decision

Il fondo della barra sono le **entrate**, e dentro ci stanno tutti i soldi del mese, nell'ordine in cui smettono di essere tuoi:

```
[ risparmio ][ fisse arrivate ][///  fisse attese  ///][ variabili spese ][   resto   ]
```

Le **fisse ancora attese sono tratteggiate**: già scontate dal numero grande, ma non ancora uscite dal conto. Quando la spesa si registra quel pezzo sparisce e cresce quello pieno accanto — la stessa lunghezza che cambia stato, e lo spendibile fermo. È la richiesta alla lettera, ed è anche la spiegazione visiva del malinteso che l'ha generata.

Il **risparmio ha un colore suo** perché è l'unica cosa nella barra che non è una spesa. Le **variabili** prendono la tinta del semaforo: sono la parte su cui si può ancora incidere, e l'unica il cui colore deve poter cambiare mentre la guardi. La **coda vuota è lo spendibile**, cioè il numero grande, disegnato.

Quando si supera la riga delle entrate la barra **non sfonda**: il denominatore diventa l'impegnato, e l'eccedenza prende un pezzo rosso in coda, separato da un filo chiaro che segna dov'erano le entrate. Senza quel filo, con il semaforo rosso anche le variabili sono rosse e i due segmenti diventano un unico blocco: misurato, 1781 € di variabili e 66 € di eccedenza indistinguibili.

**La legenda sono le righe del conto**, con un pallino del colore del loro segmento. Un elenco di colori sotto la barra avrebbe ripetuto quelle stesse righe, che i numeri li portano già.

`marginBar()` sta nel dominio e lavora in centesimi: i segmenti sommano esattamente al totale, e un test lo presidia. A guadagni oscurati **non compone niente** e torna `null` — le proporzioni *sono* i numeri, e una barra disegnata restituirebbe le entrate con una divisione (→ ADR-0016).

## Consequences

Il meccanismo diventa guardabile: si vede che l'affitto è già contato prima di pagarlo, e si vede quanto del mese non è mai stato spendibile. Il pezzo di ADR-0015 che cade è **solo** il denominatore del misuratore; tutto il resto — lo spendibile come numero grande, il conto riga per riga, il semaforo intatto — resta in piedi.

Si perde precisione su una lettura: quanto del fondo discrezionale è stato bruciato. Prima era il riempimento della barra, ora è un segmento su una scala più grande, e la stessa spesa muove meno pixel. È il compromesso accettato: la domanda «quanto mi resta» ha già una risposta in cifre grandi sopra la barra, mentre «dove sono finiti i soldi» non ne aveva nessuna.

Il segmento dell'eccedenza si chiama `eccedenza` e non `oltre` perché `oltre` è già uno stato del semaforo: con lo stesso nome finivano nella stessa classe CSS, e la regola dell'eccedenza colpiva anche le variabili. Trovato misurando le ombre calcolate, non leggendo.

Resta fuori dal codice, ed è la cosa che ha innescato tutto: **la spunta «ricorrente» si mette a mano**. Alessio l'ha deciso sapendo che un suggerimento automatico sarebbe stato possibile — sui suoi dati avrebbe preso i tre casi veri e sbagliato su due parcheggi in vacanza. Una fissa senza spunta continua a costare due volte, e la barra è ciò che permette di accorgersene.
