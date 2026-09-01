# ADR-0080: La barra dei rimborsi misura sul debito lordo

**Status:** accepted · **Date:** 2026-09-01

## Context

Il capitale di una casa lo anticipa uno dei due e rientra a rate negli anni. Alessio, il 01/09/2026: «sarebbe carino che Federica avesse una seconda barra di progressione, cross-mese, che le mostra a che punto è con i rimborsi della casa di Senigallia: più io anticipo più si allunga, più lei salda più si accorcia».

Il numero esisteva già — `ProjectStats.balance`, il residuo — ma un numero da solo non risponde a «a che punto sono»: dice quanto manca, non quanta strada è stata fatta. E il residuo, da solo, non ha un fondo su cui misurarsi.

La trappola sta nel denominatore. Con il **residuo** al denominatore la parte piena sarebbe sempre il 100 % di quel che resta, cioè la barra starebbe ferma a fondo scala per sempre e non direbbe niente. Con il **lordo** — la somma di ciò che uno dei due ha anticipato per l'altro, prima dei rimborsi — la barra si comporta come Alessio l'ha descritta: un anticipo nuovo allunga il fondo e fa scendere la frazione, un rimborso fa avanzare il pieno.

Restava da decidere se contare anche la rata del mutuo. No: la rata si salda ogni mese col resto (→ ADR-0081), quindi sommarla farebbe comparire lo stesso debito due volte nello stesso Riepilogo, e saldando il partner la barra non si muoverebbe.

## Decision

`projectProgress(stats)` torna `{ owed, repaid, left, fraction, debtor, creditor }`, dove `owed` è il **lordo del solo capitale** e `repaid` è `owed − |balance|`.

Torna `null` quando il lordo è zero: un progetto in cui nessuno ha anticipato niente non ha una barra: a zero su zero direbbe «sei indietro» di un debito che non esiste.

`repaid` è **tosato** fra zero e `owed`. Un rimborso registrato nel verso sbagliato gonfia il debito invece di ridurlo, e una barra che va oltre il suo fondo o sotto lo zero non si legge; il numero vero resta comunque in `balance`, che nessuno arrotonda.

Il disegno sta in un componente solo, `ProjectBar`, usato dal Riepilogo e dalla pagina del progetto: è la regola di `useCoupleBalance()` applicata a una cosa che si guarda con la stessa frequenza da due posti. Nel Riepilogo sta sotto la barra del mese, e **non cambia col mese scelto** — è la stessa eccezione dichiarata del saldo (→ ADR-0058): è uno stato, non una statistica.

## Consequences

«A che punto siamo» ha una risposta a colpo d'occhio, dalla parte di chi deve e dalla parte di chi incassa: la frase cambia soggetto, il numero no.

Il costo è che il fondo della barra **non è un obiettivo dichiarato**: è la somma di quel che è già successo. Quando arriverà la spesa successiva la frazione scenderà, e a chi guarda sembrerà di aver perso terreno senza aver fatto niente di male. È il comportamento chiesto, ed è anche l'unico onesto — il totale di una casa non lo si sa prima — ma va ricordato che quella barra non promette una fine.

`aria-valuenow` è la percentuale, non gli euro: l'albero di accessibilità non è il posto dove pubblicare una cifra (→ ADR-0066).
