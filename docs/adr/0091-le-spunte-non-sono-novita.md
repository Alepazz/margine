# ADR-0091: Le spunte non sono novità, e due spunte ancora in coda si annullano

**Status:** accepted · **Date:** 2026-09-03

## Context

La campanella mostra una riga per **cosa**, non per salvataggio, e il numero sul pallino **è** la lunghezza di quell'elenco (→ ADR-0052). Con la lista della spesa arriva un'operazione che si compie venti volte in mezz'ora: spuntare una cosa alla cassa.

Due problemi, e sono diversi.

Il primo è la campanella: venti righe «Federica ha preso una cosa» non sono novità, sono rumore — e sarebbero il rumore che seppellisce le novità vere, cioè le spese e le cose aggiunte alla lista. Del resto la cosa presa la si vede nella lista, che è il posto dove serve saperlo.

Il secondo è la storia pubblica: toccare una riga e ritoccarla è il gesto sbagliato più frequente della cassa, e ogni tocco è un'operazione. Alessio, nell'intervista: «una spunta si può anche togliere e quindi è come se non fosse stata mai messa».

## Decision

**Le due spunte sono mute nella campanella.** `SILENT_KINDS` in `src/domain/changes.ts` contiene `list-take` e `list-untake`, e il filtro sta **dentro `noticesOf`**: il numero sul pallino nasce dalle stesse righe che il foglio mostra, quindi filtrare altrove farebbe promettere al pallino righe che il foglio non ha — è già successo, misurato 23 contro 21. Un commit di sole spunte esiste in `changes` e non produce nessuna riga; un commit misto mostra solo le righe che non sono mute.

Il vocabolario resta **completo** per tutte e cinque le operazioni, e non è una contraddizione: `git log` si legge, e un messaggio deve dire cosa è successo. Il test di parità lo pretende comunque. Aggiungere una cosa alla lista invece **è** una novità — è una richiesta, e l'altra persona la deve vedere — quindi `list-add`, `list-edit` e `list-delete` fanno una riga.

**La coppia di spunte che non è ancora partita si annulla.** `pendingTwin` cerca in `pending` l'operazione opposta sulla stessa voce: se c'è, le due si cancellano a vicenda e non parte nessun commit. È lecito perché il remoto non ha visto né l'una né l'altra e lo stato che le due insieme descrivono è identico a quello di partenza — l'invariante «locale = remoto + coda» resta vera. Verificato al banco: dopo un tocco e un ritocco la coda è **vuota**.

Quattro limiti della regola, e sono deliberati:

- **Guarda solo `pending`.** Una spunta già committata è storia, e si corregge con un'operazione nuova che dice come stanno le cose adesso.
- **Non annulla niente mentre un commit vola**, e questo l'ha trovato la review prima del commit. `flushOnce` fotografa la coda e poi vola per uno o quattro secondi: togliere da `pending` una voce che sta in quel commit vorrebbe dire che nel repo la cosa resta presa, sul telefono no, e che **non esiste più nessuna operazione** che rimetta le due parti d'accordo — alla rilettura successiva la cosa torna nel carrello da sé, e il secondo tocco risulta annullato in silenzio. Non è un caso di laboratorio: il debounce è di 1,2 s, quindi il tocco sbagliato corretto due secondi dopo cade esattamente in quella finestra, che a una cassa è il caso normale. Con un commit in volo si accoda normalmente, e nella storia compare la coppia — che è la verità.
- **Vale solo per la coppia prendi/rimetti.** Non si generalizza ad «aggiungi e cancella», che è già gestito bene dalla potatura per catena (→ ADR-0069) e dove le due operazioni **non** sono l'una l'inversa dell'altra: cancellare una voce mai partita brucia comunque un id.
- **Prende l'ultima**, non la prima: se in coda ci fossero due spunte sulla stessa voce, quella che descrive lo stato di adesso è l'ultima.

Lo stato locale si aggiorna **anche quando la coda si annulla**: la vista era avanti di una spunta, e applicare l'operazione appena arrivata la riporta dov'era il remoto, che è il posto giusto.

## Consequences

Un gruppo nuovo in Impostazioni, «Lista della spesa», che **nasce acceso** anche sui dispositivi che hanno già toccato le spunte — perché da ADR-0054 in `localStorage` si salvano i gruppi **spenti**. È il primo gruppo che raccoglie quel beneficio senza lavoro.

Il silenzio ha un prezzo dichiarato: se l'altra persona prende tutto senza aggiungere niente, la campanella non dice niente. È il comportamento voluto — la lista lo mostra — ma vuol dire che la campanella non è più un registro completo di ciò che l'app scrive. Chi vuole tutto ha `git log`, che è dove lo storico vive davvero.

E `SILENT_KINDS` è un accoppiamento in più fra il vocabolario e la campanella: un'operazione nuova che dovesse tacere va aggiunta là, e una che non deve tacere non va aggiunta. Il tipo non lo può dire; il test che verifica quali sono i muti sì.
