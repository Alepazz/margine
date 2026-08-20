# ADR-0027: «Conclusa» e «saldata» sono due cose diverse

**Status:** accepted · **Date:** 2026-08-20

## Context

Alessio: «ogni vacanza deve avere un flag che dica "è conclusa" così non viene più mostrata nel menù a tendina».

La richiesta è chiara e la sua ragione anche: cinque vacanze in un menù, di cui quattro finite fra un anno e due anni fa, sono quattro modi di sbagliare tricount ogni volta che si inserisce una spesa.

Il punto da decidere è un altro, e non era nella richiesta: **esiste già** un campo che dice qualcosa di simile. `balance.groups['vacanze/<id>']` dichiara il punto di partenza del saldo di quella vacanza, e proprio ieri tutte e cinque sono state dichiarate saldate al 20/08/2026 con apertura zero. Sembra lo stesso fatto detto in un altro posto, e la tentazione di riusarlo è forte: se una vacanza è saldata, è finita.

Non è vero, e l'ordine dei due eventi lo dimostra. Si torna da una vacanza il 24 luglio e ci si salda a settembre: per due mesi quella vacanza è **finita e in debito**. Deve sparire dal menù — nessuno aggiunge più spese a un viaggio da cui è tornato — e deve restare nel Saldo, perché quei soldi esistono. Il verso opposto capita anche: un tricount saldato a metà viaggio, con la vacanza ancora in corso.

## Decision

Due campi, in due posti diversi, per due fatti diversi.

`Trip.closed` è **una proprietà del viaggio** e vive nei dati del viaggio: dice che il viaggio è finito, e il suo unico effetto è che quel tricount non compare più fra quelli in cui si può inserire una spesa. Si accende e si spegne dal dettaglio del viaggio, nella pagina Vacanze.

`balance.groups` è **una dichiarazione sul saldo** e vive nella configurazione: dice che a partire da una certa data quel tricount vale un certo importo. Non ha niente a che fare col fatto che il viaggio sia in corso.

Una vacanza conclusa continua a comparire nella pagina Vacanze, nel Saldo, nelle statistiche e negli elenchi. L'unica cosa che smette di fare è offrirsi come destinazione di una spesa nuova.

Il flag si trasporta con un tipo di operazione nuovo, `trip-edit`. Non si è potuto riusare `trip`, che aggiunge un viaggio: `applyOps` lo salta se l'id esiste già, e `isAlreadyApplied` risponde «già fatto» appena l'id è nei dati — cioè sempre, per una modifica. Riusarlo avrebbe fatto sparire la modifica **e** lasciato l'operazione in coda per sempre, senza un errore. Ha un test dedicato per la stessa ragione.

## Consequences

Il menù resta corto e si accorcia da sé, che è quello che serviva.

Due campi da tenere allineati a mano invece di uno derivato: chiudere una vacanza non la salda, e saldarla non la chiude. Nessuno dei due dice l'altro, ed è di proposito — la stessa cosa detta in due posti è la trappola, non la cura.

Resta un caso che va gestito nel selettore e non qui: una spesa vecchia appartiene a una vacanza conclusa, e correggerla non deve spostarla di tricount. → ADR-0026

Le cinque vacanze esistenti **non** vengono marcate concluse da questa decisione. Sono saldate, che è un altro fatto; se Alessio le vuole fuori dal menù, il flag ora c'è e sono cinque tocchi.
