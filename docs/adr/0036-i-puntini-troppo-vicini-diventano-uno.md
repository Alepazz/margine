# ADR-0036: I puntini troppo vicini diventano uno

**Status:** accepted · **Date:** 2026-08-21

## Context

Alessio: «nel 2024 siamo stati anche a New York, segnalo come punto nella mappa ma purtroppo non ho voci di spesa». Il viaggio è del 17–28 aprile 2024, cioè **prima dei tricount**, che partono da ottobre 2024: sul mappamondo c'è, nei conti no.

Un puntino in più però rompe l'inquadratura. `fitMarks` avvicina il globo finché il posto più lontano sta al 62% del raggio, quindi tenere dentro New York **allontana tutto il resto**. Misurato sulle coordinate vere: l'avvicinamento passa da 3,06 a 1,00 e la distanza minima fra due puntini crolla da 25,6px a **8,2px**. È esattamente il numero da cui nasce l'ADR-0021, che quell'inquadratura l'ha introdotta per risolverlo.

Non è un caso particolare: con posti su due continenti **non esiste un'inquadratura che li tenga tutti dentro e distinti**. Le alternative erano accettarlo (su «Tutti gli anni» i puntini europei tornano intoccabili, e per mirarli si passa dai tab dell'anno) o inquadrare solo il grappolo più fitto (New York fuori dal disco all'apertura, cioè un puntino che c'è ma non si vede).

## Decision

I puntini che cadono **a meno di 24px** l'uno dall'altro si disegnano come un puntino solo, un po' più grande, con dentro quanti sono. Toccarlo non apre niente: reinquadra il globo su quei viaggi, con `fitMarks` del sottoinsieme — la stessa funzione dell'inquadratura di partenza, già presidiata da un test — che li porta al 62% del raggio e quindi li separa.

I 24px sono la grandezza giusta perché il bersaglio di un puntino è 20px di raggio e il tocco prende il più vicino: sotto i 24 due puntini non hanno più un'area propria abbastanza grande da mirare, sopra sì.

Il raggruppamento fonde **la coppia più vicina alla volta**, finché non ne resta nessuna sotto la soglia. La versione ovvia — ogni puntino nel primo gruppo che lo accoglie — non garantiva niente: fondendo due puntini il centro si sposta, e nel caso vero si ritrovava a 23,9px da un terzo, cioè di nuovo sotto la soglia. Con la fusione a coppie la garanzia vale per costruzione, ed è quella che misura il test: **fra i puntini disegnati non ce ne sono due più vicini di un dito.** Il test è scritto sulla distanza minima, non sul meccanismo, come quello dell'ADR-0021.

Due casi limite. Due viaggi nello stesso posto non si separano nemmeno inquadrandoli: allora il tocco apre il primo, invece di essere un tocco che non fa niente. E un gruppo non mostra il cerchio della posizione approssimata: la sua posizione è già la media di più posti.

Un viaggio senza spese, per finire, esiste: `tripStats` lo calcola a zero senza schiantarsi, la validazione non chiede che un viaggio abbia spese, e il saldo non lo vede (nessun punto di partenza dichiarato, nessuna spesa). Nella pagina Vacanze i suoi giorni **contano** in «Giorni di viaggio», perché ci siete stati, e **non contano** nella «Media al giorno», che è il costo di un giorno di vacanza — dodici giorni a zero lo abbasserebbero raccontando una cosa falsa. La piastrella lo dichiara.

## Consequences

Il mappamondo regge un numero qualsiasi di viaggi su un numero qualsiasi di continenti: dove si accavallano si raggruppano, e due tocchi arrivano al viaggio.

`fitMarks` resta com'è, e l'ADR-0021 resta accepted: l'inquadratura di partenza serve ancora, ed è ancora la cosa giusta. Questo ADR aggiunge il pezzo che le mancava quando i posti non stanno in un continente solo.

Il costo è che su «Tutti gli anni» non si leggono più tutti i nomi: un gruppo dice «2 viaggi», non quali. È il compromesso accettato — due nomi accostati a otto pixel sono illeggibili comunque — e l'elenco sotto il globo porta agli stessi viaggi, che è la ragione per cui esiste (→ ADR-0020).

Il raggruppamento è O(n³) nel numero di puntini visibili. Con sei viaggi non si misura; con seicento sarebbe da rifare, e allora la strada è raggruppare a griglia invece che a coppie.

**New York non è marcata «saldata» ma «conclusa»**, ed è una cosa diversa (→ ADR-0027): serve a tenerla fuori dal menù in cui si scegli dove mettere una spesa, perché un viaggio del 2024 rimasto aperto ci starebbe per sempre. Si riapre dalla pagina Vacanze se salta fuori una ricevuta.
