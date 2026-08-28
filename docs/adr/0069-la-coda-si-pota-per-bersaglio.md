# ADR-0069: La coda si pota per bersaglio, non per voce

**Status:** accepted · **Date:** 2026-08-28

## Context

`pruneSettled` scarta dalle `settled` le operazioni che il repo riflette già, e lo faceva **una per una**: per ogni voce chiedeva a `isAlreadyApplied` «il remoto ti riflette?», e in caso affermativo la buttava.

Su due operazioni che si annullano a vicenda quella domanda dà la risposta sbagliata a entrambe. «Aggiungi una spesa, poi cancellala», entrambe committate, remoto corretto — la spesa non c'è:

- il `create` chiede «la spesa c'è?» → **no** → «non ancora applicata» → **si tiene**
- il `delete` chiede «la spesa manca?» → **sì** → applicata → **si scarta**

Resta in coda il solo `create`, e ogni sovrapposizione della coda sul remoto (`applyUnlocked`, `refreshData`) lo riapplica: **la spesa cancellata torna a schermo**, contata nel margine, nel saldo e nelle statistiche. Riprodotto eseguendo il codice, non dedotto.

La parte cattiva è la seconda. Ricancellarla non serve: la nuova `delete` va in coda, il flush la applica a un remoto dove la spesa già non c'è (nessun effetto), committa un file identico nel contenuto, la sposta fra le `settled`, e al caricamento dopo viene scartata come «già applicata» mentre il `create` resta. **Il fantasma torna**, per quattordici giorni, e dall'interfaccia non c'è modo di togliierlo.

Le altre coppie si comportano uguale: registra un rimborso e annullalo → un rimborso fantasma sposta il saldo mostrato dell'intero importo; accendi e spegni la spunta 730 → si riaccende; correggi un importo due volte → si vede la prima correzione mentre il repo ha la seconda. Sono gesti quotidiani, non casi limite. Il repo resta **corretto** — il flush manda solo `pending` — quindi è la vista locale a mentire, che in un'app dove il numero grande è la cosa che si guarda ogni giorno è quasi peggio.

Lo stesso confronto grezzo aveva un secondo difetto, più piccolo e della stessa famiglia: `isAlreadyApplied` per `tricount-edit` confrontava il valore **così com'è scritto nell'operazione**, mentre `applyOps` passa da `normalizeTricount`, che cancella `closed` quando è falso. «Riapri una vacanza» (`{ closed: false }`) non era quindi mai riconosciuta — `JSON.stringify(undefined) !== 'false'` — e restava in coda due settimane riapplicandosi a ogni caricamento. È l'errore che `update` aveva già risolto confrontando con l'**intenzione normalizzata**.

## Decision

Si pota per **bersaglio**. Le operazioni si raggruppano per la cosa che toccano — `spesa:<id>`, `rimborso:<id>`, `prezzo:<id>`, `tricount:<id>`, `categoria:<id>`, `config:categorie`, `config:entrate:<persona>` — e di ogni catena **conta solo l'ultima per `ts`**, perché è l'unica che dice come quella cosa deve stare adesso. Se il remoto la riflette, la catena è arrivata per intero e si scarta insieme; se non la riflette si tiene per intero.

L'alternativa scartata era «potare il prefisso già applicato», cioè scartare le voci più vecchie dell'ultima riconosciuta. Non funziona proprio nel caso che conta: il `create` di una spesa poi cancellata risulta *non* applicato, quindi nessun prefisso lo comprende.

`isAlreadyApplied` resta la predicato per voce e non viene sostituita da un «applica e guarda se cambia qualcosa»: è ben provata, ed è chiamata su **una** voce sola per catena, che è il punto. Per `tricount-edit` ora confronta con l'intenzione normalizzata, come `update`; e `applyPatch` ritaglia `notes` dove lo scrive, perché il confronto lo ritaglia. Non era raggiungibile — l'unico chiamante che porta `notes` ritaglia già — quindi è difesa in profondità per il secondo chiamante che arriverà, non la chiusura di un difetto vivo.

## Consequences

**La catena si tiene intera anche quando solo l'ultima manca**, ed è una voce in più che si riapplica a ogni sovrapposizione finché il commit non arriva. È innocuo — riapplicare un'operazione superata non trova niente da fare, e `applyOps` le ordina per `ts` — ed è il prezzo di non spezzare una catena a metà. Un test lo mette per iscritto, perché il vecchio comportamento (scartare la voce arrivata e tenere l'altra) sembra più ordinato ed è il difetto.

**Una catena la cui ultima operazione non arriva mai resta due settimane**, poi la scadenza (`SETTLED_TTL_MS`) la porta via. Come prima — con un limite dichiarato: la scadenza filtra **prima** che le catene si formino, quindi una catena tenuta può perdere per anzianità una voce vecchia mentre conserva le altre. «Si tiene per intero» vale entro la finestra, non oltre; a quattordici giorni da un commit non arrivato c'è già qualcos'altro di rotto.

**`recategorize` è l'eccezione, e non è coperta.** Tocca **tutte** le spese di una categoria, ma il suo bersaglio è `categoria:<from>`: sta quindi in una catena disgiunta da ogni `spesa:<id>` che modifica, e la stessa classe di fantasma sopravvive — un `update` che cambia categoria a una spesa e un `recategorize` che svuota quella categoria finiscono in catene diverse, e a schermo resta la categoria vecchia mentre il repo ha quella nuova. Riprodotto eseguendo. È un difetto **preesistente**, che questa decisione non peggiora e non cura: si chiude spargendo il bersaglio sulle spese toccate (catturate all'accodamento) oppure rendendo locale il suo `isAlreadyApplied`, ed è lavoro a parte. Il compilatore non aiuta: `targetOf` è esaustiva sui **tipi**, e non può dire se una chiave identifica la cosa giusta.

**Un caso teorico, lasciato tale.** Due `update` sulla stessa spesa con campi disgiunti — importo e titolo — in cui il remoto rifletta il secondo e non il primo farebbero scartare anche il primo. Non è raggiungibile: due voci in `settled` sono state committate entrambe, i commit sono lineari e il file letto riflette sempre un prefisso. L'unica strada che ce la porterebbe è una riscrittura della storia — che questo repo ha già fatto una volta (→ ADR-0068).

**`targetOf` è esaustiva sull'unione dei tipi**, quindi un'operazione nuova senza bersaglio non compila. È il presidio che l'invariante di `CLAUDE.md` chiedeva a mano: prima un tipo nuovo dimenticato in `isAlreadyApplied` restava in coda per sempre **in silenzio**, e nessun test se ne accorgeva.

**Cinque test descrivono i fantasmi**, uno per gesto: spesa aggiunta e cancellata (e ricancellata, che è il caso che non si aggirava), rimborso registrato e annullato, spunta accesa e spenta, importo corretto due volte. Provano l'esito visibile — cosa si vede a schermo dopo la potatura — non il meccanismo, perché è l'esito che era sbagliato.
