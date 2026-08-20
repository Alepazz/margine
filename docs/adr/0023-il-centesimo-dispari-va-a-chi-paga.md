# ADR-0023: Il centesimo dispari di una metà va a chi ha pagato

**Status:** accepted · **Date:** 2026-08-20

## Context

Alessio ha riferito due saldi letti su Tricount: 16,93 € che Federica gli deve sul tricount delle spese di casa, e 66,04 € che lui deve a lei su «Perché non sono Ric(c)a». Il primo combaciava al centesimo. Il secondo dava **−65,23 €** contro −66,04: **81 centesimi** di divario.

Ottantuno centesimi su 624 voci non sono un errore di importo — sono un errore di *un centesimo ripetuto ottantuno volte*. In quel tricount ci sono 163 spese divise a metà con un importo di centesimi dispari: 14,95 € non si divide in due, e uno dei due prende 7,48 invece di 7,47. Di quelle 163, **81 sono state pagate da Alessio** — esattamente il divario.

La causa è che **l'export di Tricount non concorda con Tricount stesso**. Nel campo `shares` dell'export il centesimo in più va sempre allo stesso membro, a prescindere da chi ha pagato; il saldo che l'app mostra a schermo si comporta invece come se andasse a **chi ha anticipato**. Ricalcolando l'export con quella regola vengono −137,04 €, che più le due spese del 19 agosto fanno **−66,04 €**: il numero di Alessio, al centesimo.

Non è distinguibile con certezza da una seconda spiegazione — che il saldo sia calcolato sulle metà *esatte* (7,475) e che le quote siano arrotondate solo per essere mostrate. Le due ipotesi differiscono di mezzo centesimo per tricount, e Margine lavora in centesimi interi per spesa (ADR-0008), quindi 7,475 non è rappresentabile. Fra le opzioni rappresentabili, «il centesimo a chi paga» è la sola che riproduce esattamente il saldo di Tricount su questi dati.

Cercando dove correggere è venuto fuori un secondo difetto, peggiore. La regola dell'app per le spese nuove era: **«la metà dispari va a chi guarda»**. Cioè la stessa spesa, inserita da Alessio o da Federica, si divideva in due modi diversi — e niente se ne sarebbe accorto, perché le quote sommano all'importo in entrambi i casi. È lo stesso genere di difetto silenzioso di `sharesFor()`, nello stesso file.

## Decision

Il centesimo dispari di una divisione a metà va a **chi ha pagato**, in tutti e tre i posti dove la regola esiste:

- `splitFor()` in `domain/expense-rules.ts`, per le spese che l'app scrive. La firma prende ora sia chi guarda sia chi paga e restituisce direttamente le **chiavi fisse** `{ me, partner }`: una traduzione sola invece di due, che è una superficie in meno su cui scambiare le quote.
- `sharesOf()` in `scripts/from-tricount.mjs`, così un reimport non disfa la correzione. Interviene **solo** sulle divisioni a metà: dove le quote sono 100/0 o fatte a mano non c'è nessun centesimo di resto e l'export dice il vero.
- Le 94 voci già importate che avevano il centesimo dal lato sbagliato, corrette una volta. Ids invariati — sono l'hash di data, titolo, totale e origine — quindi le annotazioni 730 e i rimborsi non perdono il riferimento.

Se il pagante è fuori dalla coppia il centesimo va a `partner` per convenzione. Quale dei due non ha importanza; ha importanza che **non dipenda da chi guarda**, ed è quella la proprietà che un test verifica su tutti i preset, tutti i paganti e tutte le viste.

## Consequences

Tutti i tricount ora si riconciliano con Tricount **al centesimo**, e il tricount condiviso non ha più bisogno di un saldo di apertura dichiarato: non essendo mai stato saldato, si calcola da tutta la storia e fa −66,04 €. Un numero che si ricava dai dati è più solido di un numero copiato a mano, che invecchia.

Lo spostamento su tutta la storia è di **0,94 €** distribuiti su 94 voci: la quota mensile di ciascuno cambia di qualche centesimo in mesi lontani. Le medie storiche e i confronti si spostano di un'inezia, e nessun numero raccontato finora diventa falso.

Resta un debito piccolo e dichiarato: **non so quale delle due spiegazioni sia quella vera** dentro Tricount, e con un solo tricount di riscontro non è distinguibile. Se un giorno un saldo si scostasse di mezzo centesimo, la spiegazione è scritta qui. Un test con le cifre vere presidia la direzione: la proprietà provata non è «il centesimo va a chi paga» — che è una convenzione — ma che la divisione **non cambi secondo chi ha l'app in mano**, che è un fatto.
