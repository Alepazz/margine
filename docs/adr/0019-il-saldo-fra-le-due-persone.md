# ADR-0019: Il saldo fra le due persone, con i rimborsi

**Status:** accepted · **Date:** 2026-08-20

## Context

Tricount esiste per dire una cosa che Margine non sapeva dire: **chi deve cosa a chi**. Alessio l'ha chiesta scegliendola fra tre opzioni, dopo che gli era stato detto che da sola valeva più di tutte le altre sei correzioni messe insieme.

ADR-0014 l'aveva esclusa a parole sue: *«Modellarlo richiederebbe i trasferimenti fra le due persone, cioè rifare Tricount dentro Margine — e Tricount ce l'abbiamo già»*. Quella frase però non era la decisione di ADR-0014: era il limite noto che quella decisione si annotava addosso, insieme all'altro — che i soldi rimborsati da Federica sono un'entrata reale che l'app non conta.

Il vincolo che decide tutto è nei dati. Il saldo calcolato su tutta la storia farebbe **una cifra fuori scala**: tutte le quote di Federica anticipate da Alessio, meno tutte quelle del contrario. È palesemente falso, perché in due anni si sono saldati molte volte e **nessuno di quei rimborsi esiste nei dati**. Un saldo che parte dall'inizio dei tempi non è un saldo, è la somma di tutto ciò che è mai passato per una carta.

## Decision

Un tipo nuovo accanto alle spese, dentro lo stesso file cifrato: `Settlement { id, date, from, to, amount, note? }`. Non è una spesa, non ha categoria, non compare in nessun totale del mese.

Il saldo **parte da un punto dichiarato**, in `config.balance`: `opening` è il saldo alla data `since`, e conta solo quello che viene dopo. Alessio ha scelto di mettere lì **il numero che Tricount mostra oggi**, così i due strumenti concordano da subito e Tricount può essere spento senza perdere il filo. Finché `opening` resta 0, il significato è «pari e patta a quella data», e la pagina lo dice invece di lasciarlo intendere.

Il segno è **fisso nel calcolo**: positivo = `partner` deve a `me`. La pagina lo gira per chi sta guardando. Due viste dello stesso dato, una verità sola.

Tre regole che sembrano dettagli e non lo sono, ognuna con il suo test:

- **Il welfare non si filtra.** `fundedByWelfare()` toglie la spesa dal *budget* di chi l'ha anticipata (ADR-0014), ma la quota dell'altra persona è debito eccome: quella la rimborsa in contanti. Riusare `visibleFor()` per pigrizia perderebbe la quota di Federica sui soli alberghi del Sud Italia, che è un debito vero.
- **Gli anticipi di terzi restano fuori.** Se ha pagato qualcuno del gruppo, il debito è verso di lui, non fra voi due: nei dati veri sono 32 spese, e le vostre quote su quelle non entrano nel saldo. Compaiono come nota.
- **Il saldo non tocca il margine.** Le spese contano già solo la propria quota, quindi quando il rimborso arriva il conto torna esattamente a quella. Contarlo come entrata sarebbe contarlo due volte.

**ADR-0014 resta `accepted`, e non viene marcato come superato.** La sua decisione — il flag welfare, l'esclusione per persona — non cambia di una virgola. Quello che questo ADR chiude è la conseguenza che ADR-0014 aveva dichiarato come debito. Le regole di progetto dicono di cambiare lo stato del vecchio solo quando una decisione nuova ne *cambia* una vecchia, e qui non succede.

## Consequences

Margine ora sa dire chi deve cosa a chi, ed è l'ultimo pezzo che serviva per poter spegnere Tricount sulle spese condivise. E si chiude metà del debito di ADR-0014: la quota che Federica rimborsa diventa visibile, tracciabile, e azzerabile.

Restano tre cose aperte, tutte dichiarate.

La prima: **il saldo è tanto vero quanto lo è `opening`.** Se quel numero è sbagliato, tutto lo è della stessa quantità, per sempre — e nessun controllo può accorgersene, perché non esiste un secondo posto da cui ricavarlo. È il prezzo di non poter ricostruire due anni di rimborsi in contanti.

La seconda: **Federica non ha accesso.** Una passphrase sola copre tutto il file, quindi darle Margine vorrebbe dire darle anche le 370 spese personali di Alessio. Finché è così, il saldo è un numero che lui guarda e le riferisce — che è meno di quello che Tricount faceva, dove lo vedevano entrambi. Cambiarlo richiederebbe una cifratura separata per persona: un ADR a sé, non una riga.

La terza: **l'altra metà del debito di ADR-0014 resta aperta.** Il rimborso di una spesa pagata col welfare è, per Alessio, un'entrata vera che il margine non conta: nel mese in cui arriva il margine reale è migliore di quello mostrato. Ora il saldo lo *mostra*, ma non lo somma alle entrate — perché farlo vorrebbe dire distinguere i rimborsi che compensano un'uscita già contata da quelli che compensano un'uscita esclusa dal budget, e quella distinzione non è nel dato.
