# ADR-0064: Il saldo non conta ciò che è datato dopo questo mese

**Status:** accepted · **Date:** 2026-08-27

## Context

Alessio, subito dopo aver visto i tre difetti che una sola data sbagliata aveva scoperto (→ ADR-0063, ADR-0055): «l'operazione di saldo non dovrebbe tenere conto anche delle spese future, ne terrà conto solo da quando il mese in cui la spesa futura è stata segnata inizia».

`coupleBalance` sommava tutto ciò che trovava. Una spesa datata al 15 settembre spostava il saldo di agosto, e con un affitto anticipato di mezzo — [cifra rimossa] di quota — sposta il conto fra due persone di un quarto. Il numero era «vero» nel senso che il dato c'era; era falso nel senso che rispondeva a un'altra domanda.

La domanda a cui il saldo risponde è **«quanto ci dobbiamo adesso»**, ed è la sola cifra dell'app che descrive uno stato invece di una statistica (→ ADR-0058). Un debito che nascerà a settembre non è un debito che c'è: se ve lo saldaste oggi, uno dei due pagherebbe per una spesa che l'altro non ha ancora sostenuto.

Il caso in cui questo argomento potrebbe non reggere esiste — una spesa **pagata davvero** oggi ma datata avanti, tipo l'affitto del mese prossimo versato in anticipo — ma non è la convenzione di questi dati: qui una spesa si data il giorno in cui si paga, ed è per questo che «Affitto Settembre 2026» porta la data del 27 agosto. Una data nel futuro, in pratica, è un refuso.

## Decision

`coupleBalance` non conta le voci — spese **e** rimborsi — datate dopo il mese corrente. La regola vale prima di tutto il resto: prima del punto di partenza del tricount, prima dei movimenti, prima persino della «storia» che decide se un tricount compare nell'elenco. Un tricount che esiste solo nel futuro oggi non ha niente da dire.

**La soglia è il mese, non il giorno.** Una voce datata a settembre entra nel saldo il 1º settembre, non il 15. È la scelta di Alessio, ed è quella giusta: col taglio al giorno il saldo diventerebbe una cosa che matura a mezzanotte, e una spesa registrata il 27 con la data del 31 sparirebbe per quattro giorni dal conto di chi l'ha anticipata — un debito che va e viene è peggio di un debito in anticipo.

I rimborsi seguono la stessa regola, e non per simmetria: un rimborso datato avanti abbasserebbe un debito che ancora non esiste.

**`today` è un parametro obbligatorio**, non un valore di ripiego. Chi si fosse dimenticato di passarlo avrebbe ottenuto in silenzio il comportamento di prima — cioè esattamente il difetto che questa opzione esiste per togliere. Con l'obbligo, il compilatore ha portato lui a tutti e tre i chiamanti (Riepilogo, Esplora, Saldo), che devono mostrare lo stesso numero per invariante (→ ADR-0044).

**Il saldo dichiara quello che ha messo da parte.** `CoupleBalance.deferred` conta le voci rinviate, e la pagina Saldo lo dice a parole quando è diverso da zero. Senza, il totale divergerebbe da Tricount **in silenzio**, e chi riconcilia cercherebbe la differenza dove non c'è: è la stessa lezione della campanella vuota che non diceva perché (→ ADR-0053).

## Consequences

Il saldo torna a rispondere alla sua domanda, e resiste al refuso di data che ha già prodotto tre difetti in un giorno.

Il prezzo è una divergenza dichiarata da Tricount finché una voce sta nel futuro — e non è un peggioramento, perché la divergenza c'era comunque: prima era Margine a contare qualcosa che Tricount conta pure, ma nel mese sbagliato dal punto di vista di chi guarda oggi. Ora c'è una riga che la nomina e dice come chiuderla.

Il caso «pagato davvero oggi, datato avanti» resta scoperto per scelta: chi anticipa un affitto lo registri con la data in cui l'ha pagato, che è la convenzione già in uso. Se un giorno servisse distinguere «quando è stato pagato» da «a quale mese appartiene», sarebbe un campo nuovo e un ADR nuovo, non un'eccezione qui dentro.

Le spese future restano **visibili** ovunque le si guardi — nell'elenco, nella striscia dei mesi, nei totali del loro mese. È deliberato e coerente con ADR-0055: il dato non si nasconde, è guardandolo che ci si accorge dell'errore. Cambia solo cosa il **saldo** considera già successo.

La soglia è una funzione esportata, `notYetInBalance`, e il saldo non è il solo a chiamarla: il pannello che sposta una spesa di tricount la usa per non annunciare al presente un debito che si muoverà il mese prossimo. Due espressioni della stessa soglia prima o poi direbbero cose diverse. E il saldo si costruisce da un posto solo, `useCoupleBalance()`, perché a mostrarlo sono tre pagine che devono mostrare lo stesso numero: con la chiamata ripetuta, `today` poteva divergere in una sola e nessun test se ne sarebbe accorto.

Da ricordare: `deferred` conta le voci scartate, non il loro importo. È abbastanza per andare a cercarle, e un importo avrebbe voluto un segno — cioè la stessa domanda «da che parte pende» risolta in un secondo posto (→ ADR-0060).
