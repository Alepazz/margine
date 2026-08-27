# ADR-0058: Il saldo sta accanto al numero grande

**Status:** accepted · **Date:** 2026-08-27

## Context

Richiesta di Alessio: *«oltre al limite di spesa mensile, vorrei sempre poter vedere quanto sono in positivo o negativo rispetto Fede»*. Alla domanda su dove metterlo ha risposto: accanto a «Puoi ancora spendere».

C'è una regola del progetto che dice il contrario. ADR-0034 ha diviso il Riepilogo da Statistiche con un criterio secco: *se cambia scegliendo un mese sta nel Riepilogo, altrimenti in Statistiche*, perché «un selettore del mese che non cambia metà della pagina è una promessa non mantenuta». Il saldo con l'altra persona non cambia col mese scelto: è un totale corrente, che parte dai punti di saldatura dichiarati e arriva a oggi.

E c'è un secondo motivo di prudenza: il saldo e il margine sono due grandezze che **non vanno sommate**. Le spese contano già solo la propria quota, quindi quando un rimborso arriva il conto torna esattamente a quella; contare il credito verso l'altra persona come soldi spendibili sarebbe contarlo due volte (→ ADR-0019). Metterli vicini è proprio il gesto che invita a sommarli.

## Decision

Il saldo sta nella scheda del margine, **a destra del numero grande**, sotto il semaforo: etichetta, cifra col segno, e una riga che dice il verso — «te li deve», «glieli devi», «nessun debito». Si tocca e porta alla pagina Saldo.

È un'eccezione dichiarata ad ADR-0034, non una smentita. La regola vale ancora per le **statistiche**, che sono la cosa che ADR-0034 stava separando: dove si guarda un numero per capire un andamento, il mese deve comandare. Il saldo non è una statistica del mese — è uno stato, come il semaforo che gli sta sopra, e nessuno si aspetta che un semaforo cambi scegliendo giugno. La riga sotto la cifra lo dice comunque.

Il calcolo **non passa da `visibleFor()`** e non tocca il margine: `coupleBalance` vuole tutte le spese, ha un segno fisso — positivo vuol dire che `partner` deve a `me` — e la vista lo gira per chi sta guardando, esattamente come fa la pagina Saldo. Due viste dello stesso dato, una verità sola.

La riga che contiene numero grande e saldo **avvolge**, e non la si tiene affiancata per forza: sul telefono semaforo e saldo vanno a capo insieme e restano appoggiati a destra sotto la cifra. Forzare `flex-wrap: nowrap` sarebbe far decidere al contenuto la larghezza del contenitore, che in questo progetto è già costato una volta (→ ADR-0033).

## Consequences

La domanda «e con lei come sto?» ha una risposta senza cambiare pagina, e la pagina Saldo resta dov'è per tutto il resto — i movimenti, i tricount, registrare un rimborso.

Il rischio accettato è che due numeri vicini si sommino nella testa di chi guarda: 419 € di spendibile e 66 € di credito non fanno 485 € di disponibilità. Non c'è modo di impedirlo dall'interfaccia, se non tenendoli lontani — che era la situazione di prima, e costava due tocchi al giorno per evitare un errore che nessuno aveva mai fatto.

Il criterio di ADR-0034 esce indebolito: da «tutto ciò che non cambia col mese sta altrove» a «tutte le *statistiche* che non cambiano col mese stanno altrove». Chi vorrà aggiungere un numero sempre-corrente al Riepilogo troverà qui un precedente, ed è giusto che lo trovi insieme al motivo per cui questo l'ha meritato: è uno stato, non una misura.
