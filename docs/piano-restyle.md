# Piano di restyle: un'app, due scopi

Scritto il 21/08/2026, su richiesta di Alessio: «L'app ha due scopi: tricount con statistiche, previsioni, spese ecc, e tracking dei supermercati. Ripensa interamente le sezioni in modo che sia comodo sia aggiungere una voce al tricount corretto (che potrebbero anche essere dei flag) sia aggiungere e vedere le voci dei prodotti al supermercato».

È un piano di **navigazione ed ergonomia**: non tocca il modello dati, la coda, la cifratura, né alcuna rotta esistente. Le decisioni che erano aperte sono state prese da Alessio il 21/08/2026 (in fondo), compresa una quinta arrivata dopo la prima stesura: la quinta voce della barra non è un menù ma una **pagina-hub** con le anteprime, sul modello delle app di finanza native. Il piano è chiuso e si può implementare così com'è.

## Diagnosi

L'architettura attuale è figlia di un'app a scopo singolo, a cui i prezzi sono stati aggiunti dopo:

1. **Il secondo scopo è sepolto.** La barra ha Riepilogo · Casa · Gatto · Vacanze — quattro viste del mondo tricount — mentre Prezzi sta nel menù `⋯` in alto a destra, fra cinque voci. Consultare un prezzo davanti allo scaffale costa: `⋯` (in alto, lontano dal pollice) → «Prezzi al supermercato» → cerca. Registrarne uno costa un tocco in più. Per un'attività che si fa **in piedi, col carrello**, è il percorso più lungo dell'app.
2. **Il `+` conosce un solo verbo.** Il pulsante centrale aggiunge una spesa e basta: l'altra metà dell'app non ha un'azione primaria.
3. **Il tricount è il campo più importante del modulo spesa, ed è il meno visibile.** È una tendina (`LedgerSelect`): mostra solo il valore corrente, le alternative stanno dietro un tocco, e sbagliare tricount è l'errore che poi va corretto spostando la spesa. Coi tricount aperti che sono tipicamente tre o quattro (fisse, condivise, personale, al più una vacanza in corso), una tendina nasconde ciò che starebbe comodamente in una riga.
4. **Registrare la spesa al supermercato è una sessione, il modulo è un colpo singolo.** `PriceForm` si chiude a ogni salvataggio: cinque prodotti = cinque volte prodotto + supermercato + prezzo + data, quando supermercato e data sono per definizione gli stessi per tutta la sessione.

## Proposta

### 1. La barra serve i due scopi

Nuova barra (telefono), da sinistra: **Riepilogo · Spese · `+` · Prezzi · Esplora**.

- **Riepilogo** resta la casa del mondo tricount: margine, mese, confronti. Invariato nei contenuti.
- **Spese** sale in barra: è l'elenco dove si cerca e si corregge una voce, la consultazione più frequente dopo il Riepilogo. Invariata nei contenuti.
- **Prezzi** sale in barra: il secondo scopo dell'app a un tocco, sia per consultare che per registrare. L'etichetta in barra è «Prezzi» (il nome lungo «Prezzi al supermercato» resta come titolo di pagina).
- **Esplora** (glifo 🧭, rotta nuova `/esplora`) sostituisce il menù `⋯` della testata, ma non è un menù: è una **pagina-hub** — il pattern delle app di finanza native, dove il tab è una sezione con gerarchia interna. Dentro, schede in due gruppi — **Raccolte** (Casa, Gatto, Vacanze) e **Analisi** (Statistiche, Spese da 730, Saldo) — e ogni scheda porta **il suo numero già in vista**: il primo tocco informa, non apre solo una porta.

Le anteprime delle sei schede, tutte da selettori che esistono già e rispettose di `view.person` come le pagine che aprono:

| Scheda | Anteprima |
|---|---|
| Saldo | il netto e in che verso |
| Statistiche | sparkline degli ultimi 12 mesi |
| Casa | il totale del mese corrente |
| Gatto | il totale del mese corrente |
| Vacanze | l'ultimo viaggio (o quello in corso) con le date |
| Spese da 730 | quante voci marcate nell'anno corrente |

Il tab «Esplora» resta evidenziato anche quando si è dentro una delle sue sei sottopagine (la logica dell'attuale `onMoreRoute`, applicata alla classe del NavLink), e le sei sottopagine guadagnano un link «‹ Esplora» in testa — visibile solo su telefono, nascosto dalla stessa media query che nasconde la barra, perché su schermo grande ci si arriva dalla colonna e quel link mentirebbe. Il gesto «indietro» del telefono funziona da sé: è history del browser.

Casa, Gatto e Vacanze scendono dalla barra all'hub: da un tocco a due. È il costo della proposta, ed è deliberato — sono viste di lettura che si aprono ogni tanto, mentre Spese e Prezzi si aprono con qualcosa in mano (uno scontrino, un carrello) — e l'hub lo ammorbidisce: spesso il numero sulla scheda basta e il secondo tocco non serve più. La testata perde il `⋯` e tiene sincronizzazione, tema e ingranaggio.

Il Riepilogo invece **non** diventa un hub, di proposito: è già la risposta a una domanda («quanto margine ho»), e spezzarlo in schede-porta aggiungerebbe un livello a ciò che si legge in una schermata. La gerarchia paga dove il livello intermedio informa; dove la pagina è già la destinazione, costa solo tocchi.

Sulla **colonna laterale** (schermo grande) non si nasconde niente, come oggi: le voci si mostrano tutte e piatte — Riepilogo, Spese, Prezzi in testa, poi le intestazioni Raccolte e Analisi con le loro sei voci — senza passare dall'hub, che è una concessione al telefono, non un'architettura (Esplora nella colonna non compare). Sopra la navigazione stanno **due** pulsanti d'azione: «+ Aggiungi una spesa» e «+ Registra un prezzo».

Il sottotitolo del marchio smette di dire una cosa sola: `spese e statistiche` → **`spese e prezzi`**.

### 2. Il `+` aggiunge la cosa della pagina in cui sei

Regola unica, senza menù intermedi: **su `/prezzi` il `+` registra un prezzo; ovunque altro aggiunge una spesa.** Zero tocchi in più sull'azione più frequente (la spesa), e il prezzo resta a due tocchi da qualsiasi punto dell'app (tab Prezzi → `+`). L'`aria-label` e il `title` del pulsante cambiano con la rotta, così anche chi usa lo screen reader sa quale verbo sta per usare.

L'alternativa considerata — il `+` apre sempre un foglio di scelta «Spesa / Prezzo» — mette un tocco in più davanti a **ogni** spesa per risparmiarne uno sui prezzi: il rapporto d'uso va nell'altra direzione.

### 3. Il tricount si sceglie con le spunte, non con una tendina

Nel modulo spesa, `LedgerSelect` è sostituito da una **fila di chip** («i flag» della richiesta): un chip per ogni tricount offerto da `tricountOptions` — quindi solo i propri, i conclusi esclusi salvo quello della spesa che si sta correggendo, esattamente le regole di oggi — con emoji e nome, il selezionato evidenziato, e in coda un chip d'azione «+ Vacanza» che apre l'attuale `TricountForm`. Le vacanze mostrano l'anno come oggi («🇬🇷 Grecia 2026»).

Perché è meglio della tendina: si vede **dove sta andando la spesa** e dove *non* sta andando, con le alternative davanti agli occhi invece che dietro un tocco — è la difesa più economica contro l'errore «finita nel tricount sbagliato». E cambiare tricount, che oggi è due tocchi più uno scroll, diventa un tocco.

Regole di costruzione:

- La fila **va a capo** (`flex-wrap`), mai in scroll orizzontale e mai a spingere la larghezza del foglio: è la lezione di ADR-0033 (`min-width: 0`, la larghezza non la decide il contenuto).
- Bersagli ≥ 44px, testo dei chip a dimensione leggibile ma i chip compatti: con quattro tricount devono stare in una riga o due.
- La logica non cambia di una virgola: `changeLedger` resta identico (azzeramento di categoria/quota terzi al cambio di mondo), `tricountOptions` resta l'unica fonte delle opzioni. Cambia solo il vestito del controllo.
- `LedgerSelect` **resta** dov'è una tendina la scelta giusta: il filtro della pagina Spese, dove le opzioni sono di più (c'è «Tutti i tricount») e la scelta è occasionale.

### 4. Registrare i prezzi diventa una catena

`PriceForm` smette di chiudersi a ogni salvataggio. Dopo un salvataggio riuscito: toast di conferma (quello attuale, con prodotto, prezzo e supermercato), poi il modulo **resta aperto** con supermercato e data conservati e prodotto, prezzo, nota e `unitTouched` azzerati, col fuoco riportato sul campo prodotto. I pulsanti diventano «Registra» (salva e continua) e «Ho finito» (chiude). Cinque prodotti passano da 5 × (prodotto + supermercato + prezzo + data) a 1 × supermercato + 5 × (prodotto + prezzo).

Il modulo esce dalla Card in cima alla pagina Prezzi e diventa un **foglio dal basso** come il modulo spesa (nuovo componente `PriceSheet`, un involucro sottile che monta `PriceForm` dentro la struttura `sheet-backdrop`/`sheet` già esistente): serve perché ora lo apre anche il `+` della barra da `AppShell`, e perché a modulo aperto la pagina sotto resta consultabile chiudendolo — utile proprio al supermercato, dove si alterna «quanto costava?» e «lo registro».

Il pulsante «Registra un prezzo» accanto alla ricerca nella pagina Prezzi resta: è la via scopribile, il `+` è quella veloce.

### 5. Cosa non cambia, per costruzione

- **Nessuna rotta esistente cambia**: i percorsi `#/casa`, `#/prezzi` ecc. restano quelli, e i segnalibri sui due telefoni continuano a funzionare. Se ne aggiunge **una sola**, `#/esplora`.
- **Zero modifiche a dati, coda, dominio, cifratura, identità, sync**: nessun campo nuovo, nessuna operazione nuova, nessuna migrazione. I 245 test di dominio non si toccano e devono restare verdi senza modifiche.
- I contenuti delle pagine (Riepilogo, Statistiche, Casa, Gatto, Vacanze, 730, Saldo, Spese) restano quelli: si sposta la porta, non le stanze.
- `--tabbar-h` è già misurato con ResizeObserver, quindi la barra può cambiare composizione senza rompere lo spazio riservato in fondo alle pagine.

## Passi d'implementazione

Nell'ordine, ognuno lasciando l'app funzionante:

1. **`src/components/PriceSheet.tsx`** (nuovo): foglio dal basso che monta `PriceForm`; prende i dati da `useReadyStore` (`dataset.prices`, `addPrice`) e il toast da `useToast`, gestisce Escape e il click sul fondale come gli altri fogli. Espone solo `onClose`.
2. **`src/components/PriceForm.tsx`**: la catena. `onSave` viene chiamato come oggi, ma il modulo azzera prodotto/prezzo/nota/`unitTouched` e conserva supermercato/data invece di essere smontato; il fuoco torna al campo prodotto (`ref` + `focus()` dopo il salvataggio). Pulsanti «Registra» e «Ho finito» (`onCancel` diventa la chiusura, e va rinominato `onDone` se il nome mente). Attenzione all'unità: `unitTouched` deve tornare `false` a ogni prodotto nuovo, altrimenti la scelta fatta per il pecorino si appiccica al latte.
3. **`src/pages/Prezzi.tsx`**: usa `PriceSheet` al posto della Card inline; il resto della pagina invariato.
4. **`src/pages/Esplora.tsx`** (nuovo) + rotta `/esplora` in **`src/App.tsx`**: la pagina-hub. Sei schede-link (`Link` di react-router dentro una `Card` tappabile, bersaglio intero ≥ 44px) in due gruppi con intestazione, Raccolte e Analisi, ognuna con la sua anteprima dalla tabella sopra. I numeri escono da `usePageData` e dai selettori esistenti (`expensesOfMonth`, la serie per la sparkline, il calcolo del saldo della pagina Saldo, `tripsOf` per l'ultimo viaggio, il conteggio `tax730` sull'anno): **nessun selettore nuovo nel dominio** — se un'anteprima ne richiedesse uno, si semplifica l'anteprima, non si allarga il dominio.
5. **`src/components/AppShell.tsx`**: nuova `NAV` (slot `tabbar`: Riepilogo, Spese, Prezzi, Esplora; slot `hub`: Casa, Gatto, Vacanze, Statistiche, 730, Saldo — con un campo `group: 'raccolte' | 'analisi'` per le intestazioni della colonna laterale); `MoreMenu` **si elimina**; il tab Esplora è un NavLink normale, evidenziato anche sulle sei sottopagine (la logica dell'attuale `onMoreRoute`); il `⋯` sparisce dalla testata; lo stato `adding` diventa `'expense' | 'price' | null` e il `+` sceglie in base a `pathname === '/prezzi'`, con `aria-label`/`title` coerenti; la colonna laterale mostra le voci piatte coi due gruppi (senza Esplora) e i due pulsanti d'azione; `brand-sub` aggiornato.
6. **Le sei sottopagine** (`Casa`, `Gatto`, `Vacanze`, `Statistiche`, `Tax730`, `Saldo`): link «‹ Esplora» in testa, un componente piccolo e condiviso (`HubBackLink` in `ui.tsx` o simile), nascosto su schermo grande dalla stessa media query della barra.
7. **`src/components/ExpenseForm.tsx`** + **`src/styles/components.css`**: la fila di chip al posto di `LedgerSelect` (le opzioni da `tricountOptions(tricounts, person, { current })` come oggi), chip «+ Vacanza» in coda, stili `.choice-chip`/`.is-active` coi token esistenti (niente esadecimali nei componenti), `flex-wrap` e bersagli ≥ 44px. Qui anche gli stili delle schede dell'hub.
8. **Verifica sul banco isolato** (rsync con percorsi assoluti e `--exclude /data`, dati d'esempio, passphrase documentata `margine-dev`, porta 5199, Playwright): barra nuova su viewport telefono e colonna su desktop; `+` che apre il modulo giusto su `/` e su `/prezzi`; catena di due prezzi con supermercato conservato e unità ri-azzerata; chip che vanno a capo e foglio che non scivola di lato (il difetto di ADR-0033); hub con le sei anteprime giuste sui dati d'esempio, tab Esplora evidenziato dentro `/casa`, link «‹ Esplora» presente su telefono e assente su desktop; tema scuro. `page.goto()` su URL solo-hash non ricarica: usare `location.reload()` dove serve stato pulito.
9. **ADR-0044** («La barra serve i due scopi dell'app»), stesso commit: barra Riepilogo·Spese·`+`·Prezzi·Esplora, `+` contestuale, hub con anteprime al posto del menù; alternative respinte: il foglio di scelta sul `+`, Vacanze tenuta in barra al posto di Spese, e il foglio-menù «Altro» (la prima stesura di questo piano) — un cassetto che porta senza informare. La catena dei prezzi e i chip **non** hanno un ADR: reversibili in dieci minuti, nessun vincolo nascosto.
10. **`CLAUDE.md` di progetto**: aggiornare la struttura (`PriceSheet` fra i componenti, `Esplora` fra le pagine) e il commento sulla navigazione se ne cita la composizione. Poi `/simplify`, review del diff, commit.

Nessun file di `src/domain/`, `src/data/` o `scripts/` viene toccato.

## Decisioni prese (Alessio, 21/08/2026)

1. **Il quarto posto in barra è Spese**, non Vacanze: è la consultazione più frequente dopo il Riepilogo, il mappamondo si apre ogni tanto e resta a due tocchi in «Altro».
2. **Casa e Gatto a due tocchi va bene**: sono raccolte tematiche di lettura.
3. **Il `+` è contestuale**, senza foglio di scelta: il foglio tasserebbe ogni spesa di un tocco. Se all'uso il verbo che cambia dovesse confondere, il ripiego è il foglio di scelta e si cambia in mezz'ora.
4. **I chip del tricount valgono sia inserendo sia correggendo**, con le stesse regole di oggi (il tricount concluso della spesa in correzione compare fra i chip). Un controllo diverso fra i due casi sarebbe da imparare due volte.
5. **La quinta voce della barra è una pagina-hub con le anteprime, non un foglio-menù** (deciso dopo la prima stesura, su reference di app di finanza native portata da Alessio): i tocchi restano due, ma il primo già informa — spesso il numero sulla scheda basta e il secondo non serve più. Il Riepilogo però non diventa un hub: dove la pagina è già la destinazione, la gerarchia costa solo tocchi.

## Stima

Due file nuovi (`PriceSheet`, la pagina `Esplora`), sei modificati in modo sostanziale (`AppShell`, `ExpenseForm`, `PriceForm`, `Prezzi`, `App`, `components.css`) e sei ritocchi da una riga (il link «‹ Esplora» nelle sottopagine). Zero dominio, zero dati. È un lavoro da una sessione, con la verifica sul banco compresa.

## Com'è andata (21/08/2026)

Implementato. Quello che vale nel lungo periodo sta in **ADR-0044**, che è la fonte di verità: questo file resta il piano come è stato approvato, non la descrizione di com'è fatto adesso. Tre scostamenti, tutti emersi eseguendo:

1. **Il link «‹ Esplora» lo rende `AppShell`, non le sei pagine.** Il guscio è l'unico posto che sa quali rotte stanno nell'hub, quindi sei pagine non possono divergere dalla barra: un posto invece di sei, e il passo 6 del piano è sparito.
2. **Le vacanze nei chip stanno raccolte sotto «🌍 Vacanze (n)».** Mostrarle tutte fa otto chip su cinque righe e manda «Cos'era» e «Quanto» sotto la piega a ogni spesa. Misurato sul banco, non previsto qui.
3. **La fila di chip per il tricount è durata un giorno.** Provata sull'app vera il 22/08, rovesciata da **ADR-0045**: anche collassata costava tre righe dove la tendina ne costa una, e stavano prima dei due campi che si scrivono ogni volta. La decisione n. 4 qui sopra vale quindi solo come storia — il selettore è di nuovo `LedgerSelect`.
4. **Due difetti che solo il browser poteva mostrare**: l'unità di misura che si appiccicava al prodotto successivo (serviva rimettere `unit` a `kg`, non solo `unitTouched` a falso — il piano l'aveva previsto a metà), e le schede dell'hub che sfondavano di 27px perché il minimo implicito di `1fr` è `auto` invece di zero.
