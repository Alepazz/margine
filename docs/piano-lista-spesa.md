# Piano: la lista della spesa

Scritto il 03/09/2026, su richiesta di Alessio: «la possibilità di segnare le cose che si devono comprare quando si va a far la spesa. Deve essere comodo aggiungere la necessità di un prodotto e deve essere comoda la consultazione della lista stessa, con tanto di check delle cose che si sono prese». Con quantità numerica o a peso, supermercato facoltativo, e **il titolo come unico campo obbligatorio**.

Le decisioni aperte sono state prese da Alessio nell'intervista dello stesso giorno, e stanno in fondo. Il piano è chiuso e si può implementare così com'è.

## Il modello: funziona come Bring

La domanda che ha cambiato la forma del piano è cosa succede a una cosa spuntata. Alessio: «Al click su un prodotto quel prodotto viene messo nel carrello quindi esce dalla spesa. Se lo si rimuove dal carrello viene rimesso nella spesa. La lista deve essere solo un elenco di cose che vanno prese, quindi quello che c'è è tutto quello che è ancora da prendere, quello che è nel carrello è già stato preso, che sia appena stato preso oppure mesi fa. Deve funzionare come l'app Bring».

Da qui discende tutto, e discende una **semplificazione**: il carrello non è un archivio di cose fatte, è il **catalogo dei prodotti di casa**. Riaggiungere «Latte» dal carrello lo riporta nella lista con la sua quantità, il suo supermercato e la sua nota — quindi la «memoria dei prodotti» e le pastiglie «Ricompra», che nell'intervista erano una proposta a sé, non sono un meccanismo a parte: sono la stessa cosa vista da un altro lato. Un meccanismo in meno da costruire e da tenere in piedi.

Conseguenza da mettere per iscritto, perché è controintuitiva: **una cosa presa non scade e non si cancella da sola**. Il carrello cresce fino a contenere il vocabolario della casa — un centinaio, forse duecento voci — e si stabilizza lì, perché ogni «Latte» successivo è la stessa voce che va e torna. Le voci una tantum («cornice per il quadro») restano in fondo al carrello, e si cancellano a mano dal foglio di dettaglio.

```
ShoppingItem {
  id
  title                                   // l'unico campo obbligatorio
  qty?      number                        // 3, oppure 1,5
  unit?     'pezzo' | 'kg' | 'g' | 'l' | 'ml'
  store?    string                        // testo libero, come per i prezzi
  note?     string                        // la «descrizione»
  takenAt?  string                        // ISO datetime. Assente = da prendere
  addedAt   string                        // ISO `AAAA-MM-GG`
}
```

`takenAt` **assente** vuol dire «da prendere», presente vuol dire «nel carrello», e la sua ora è ciò che ordina il carrello dal più recente. Un campo solo, e non un booleano più una data, perché due campi che dicono la stessa cosa prima o poi si contraddicono.

`qty` senza `unit` non è uno stato che l'interfaccia produce (scegliere un numero obbliga a scegliere un'unità, che parte da «pezzo»), ma i validatori lo accettano trattandolo come pezzi: un dato scritto a mano non deve bloccare la pubblicazione per una cosa che si può leggere. `unit` senza `qty` invece si rifiuta: «kg di mele» non vuol dire niente.

Come si scrive una quantità: `×3` per i pezzi, `3 kg` / `500 g` / `1,5 l` / `500 ml` per le misure. La funzione sta nel dominio (`qtyLabel`) e ha un test, perché la virgola decimale e l'assenza di quantità sono i due casi in cui si sbaglia.

## Dove vive: un quarto file cifrato

`public/data/shopping.json.enc`, con `ShoppingFile { version, updatedAt, items }`, e `github.shoppingPath` facoltativo come `configPath` e `cardsPath`. Le tre ragioni sono le stesse di ADR-0082, e una è nuova e decisiva:

- **`import.mjs` ricostruisce il master da zero ogni mese**, quindi ciò che nasce nell'app e vive in `Dataset` va ricopiato a mano nell'import o la sessione mensile lo cancella in silenzio. Un file separato l'import non lo tocca.
- **La campanella decifra il file delle spese due volte per ogni novità**, e sono 375 kB l'uno: una lista che con le novità delle spese non c'entra non deve pesare su quella lettura.
- **Ogni spunta riscrive il file per intero**, perché ogni cifratura usa un IV nuovo (→ ADR-0025). Con la lista dentro il file delle carte, ogni tocco alla cassa ricifrerebbe anche i sessanta kilobyte delle facce delle tessere; dentro il file delle spese, trecentosettantacinque. Da sola, la lista sta in pochi kilobyte, ed è l'unico dato dell'app che cambia venti volte in mezz'ora.

Il quarto file costa che ogni posto che ne gestiva tre ne gestisca quattro: `fileOf` guadagna il valore `'shopping'` (l'unione è esaustiva, quindi un'operazione nuova senza destinazione non compila), `RemoteView` guadagna una chiave **obbligatoria** `shopping` (dimenticarla non darebbe un errore ma il fantasma di ADR-0069, con una cosa cancellata che torna in lista), e `publish`, `decrypt`, `validate`, `seed` e lo store guadagnano un ramo ciascuno. Il file **può non esistere**: un `404` vale «lista vuota», e la prima voce lo crea riusando la `kdf` già in mano (`kdfRef`), perché una `kdf` nuova costerebbe una derivazione in più a ogni sblocco, per sempre.

## Le cinque operazioni della coda

`list-add`, `list-edit`, `list-take`, `list-untake`, `list-delete`.

`list-take` e `list-untake` **non** sono un `list-edit` su `takenAt`, e la ragione è che sono l'operazione più frequente dell'app: il messaggio di commit deve poter dire «1 cosa presa» invece di «1 voce modificata», e la campanella deve poterle tacere (sotto). Sono idempotenti per costruzione — la prima scrive `takenAt`, la seconda lo toglie — quindi riapplicarle in ordine non fa danni, che è la condizione che ADR-0069 chiede a tutte le operazioni della coda.

**Due spunte in coda si annullano.** Alessio, nell'intervista: «una spunta si può anche togliere e quindi è come se non fosse stata mai messa». Il modo giusto di ottenerlo non è un commit di compensazione ma una potatura **in coda, prima della partenza**: se un `list-take` su una voce è ancora `pending` e arriva il suo `list-untake`, le due si cancellano a vicenda e non parte nessun commit. È lecito perché il remoto non ha visto né l'una né l'altra e lo stato finale è identico a quello di partenza; e vale **solo** su `pending`, perché una spunta già committata è storia e la si corregge con un'operazione nuova. È il solo pezzo di meccanica nuova nella coda, sta in una funzione sua con i suoi test, e non tocca le altre operazioni.

Il resto della coda funziona già: il bersaglio di ogni operazione è `lista:<id>`, quindi la potatura per catena di ADR-0069 gestisce senza modifiche «aggiungi e cancella» e «spunta due volte». `isAlreadyApplied` vuole un ramo per ognuna delle cinque, e per `list-edit` confronta con l'**intenzione normalizzata** come fanno `update`, `tricount-edit` e `card-edit`: un campo si cancella con la stringa vuota, non con `undefined`, perché `JSON.stringify` butta via le chiavi `undefined` e la coda vive in `localStorage`.

## La lettura: dall'API mentre la pagina è aperta

Misurato il 03/09/2026: il deploy del sito è un workflow (non il vecchio Jekyll, quindi il limite di dieci ricostruzioni all'ora non si applica), dura dai trentuno ai cinquantuno secondi, e i deploy stanno in coda **uno alla volta** (`concurrency: group: pages, cancel-in-progress: false`). Venti spunte fanno venti workflow in fila: il repo è sempre giusto, GitHub Pages resta indietro di minuti. Le proprie spunte si vedono comunque subito, perché la coda locale si riapplica sopra i dati scaricati; quelle dell'altra persona no — ed è esattamente il caso che una lista condivisa deve servire.

Quindi, **per il solo file della lista**, una seconda via di lettura: `getFile(github, token, github.shoppingPath)`, che legge dall'API alla punta del branch, dove il contenuto è aggiornato appena il commit passa. Non sostituisce niente: all'apertura dell'app i quattro envelope arrivano dal sito come adesso (un percorso solo, nessun token necessario, e il salt serve comunque allo sblocco), e la lettura dall'API è una **freschezza in più** che si attiva mentre la pagina della lista è montata.

- Si risonda ogni 30 s, e a ogni ritorno in primo piano (`visibilitychange`). Costa una richiesta per giro: con un token il limite di GitHub è 5.000 all'ora, quindi centoventi richieste all'ora non lo sfiorano.
- **Senza token non si sonda affatto**, e non è un ripiego da inventare: senza token il limite è sessanta richieste all'ora per indirizzo IP, che la campanella già consuma, e finirle rende muta anche quella (è già successo, → ADR-0053). Senza token la pagina mostra ciò che il sito ha dato e lo dice in una riga.
- Un guasto della sonda **non svuota la lista** e non diventa un errore a schermo: si tiene ciò che si ha. Un elenco vuoto per una lettura fallita è indistinguibile da un elenco vuoto perché non c'è niente da comprare, e la seconda cosa è rassicurante mentre la prima non lo è — la lezione di ADR-0053, applicata prima di sbagliarla.
- La chiave si deriva dalla `kdf` dell'envelope letto (`deriveKeyCached`), come fa già `flushOnce`: i quattro file condividono il salt di proposito, quindi nel caso normale la chiave è quella già in memoria.

## La pagina

Rotta `/lista`, voce in Esplora nel gruppo **«In negozio»** accanto a Carte, con il numero di cose da prendere già sulla scheda — è la condizione che ADR-0044 pone alle anteprime dell'hub, e questo numero esce da un `filter` sulle voci, quindi non pretende nessun selettore nuovo. Il `+` dell'isola, su quella pagina, aggiunge alla lista: è il quarto verbo dopo spesa, prezzo e carta.

**Da prendere**, in cima. Le voci si toccano per spuntarle — il bersaglio è la riga intera, non una casella da 16px: si usa in piedi con un pollice, e ADR sull'ergonomia chiede 44px. Un tocco lungo, o il pulsante «Modifica» nel foglio di dettaglio, apre la correzione; il foglio è anche dove si cancella. Le righe portano titolo, quantità, negozio (quando c'è) e il prezzo migliore noto (sotto).

**Sezioni per supermercato solo quando servono**: se fra le cose da prendere ci sono almeno due negozi distinti, l'elenco si intervalla delle intestazioni di negozio con «Ovunque» in testa per le voci senza; se sono tutte dello stesso negozio, o tutte senza, le intestazioni non compaiono. È la regola delle intestazioni di giorno della pagina Spese (→ ADR-0077): a deciderlo è la pagina, che è l'unica a sapere cosa sta mostrando, e un'intestazione che compare una volta sola non separa niente.

**Nel carrello**, sotto, dal più recente: barrato, con il tocco che rimette la voce in lista. Si mostrano dodici voci con `ShowMore` per le altre, perché il carrello è anche il catalogo e dopo qualche mese contiene tutto.

**Il prezzo migliore noto**, dall'osservatorio dei prezzi: fra i gruppi di `priceBoard` con lo stesso `nameKey(title)` si prende quello aggiornato più di recente, e si scrive la sua riga migliore — «da Esselunga 1,99 €/kg» (cifre d'esempio: → ADR-0067). Nessun confronto fra unità: la riga dichiara la sua, e l'incrocio fra `g` e `kg` sarebbe una regola in più per un guadagno nullo. È il primo collegamento fra le due metà «in negozio» dell'app, e costa un `useMemo` perché il tabellone esiste già.

**L'aggiunta è una sessione**, come il modulo dei prezzi e per la stessa ragione: si aggiungono cinque cose in fila, non una. Il foglio non si chiude quando salva, il fuoco torna sul titolo, il **supermercato resta** fra un'aggiunta e l'altra (è il contesto del giro) e tutto il resto si azzera — quantità compresa, con l'unità che torna a «pezzo» **e** a «non scelta», che è la coppia di azzeramenti che ADR-0041 ha imparato a sue spese. Il titolo propone i nomi già usati (`suggest`, dal dominio dei prezzi, che è neutro), il supermercato propone i negozi della lista, quelli delle rilevazioni di prezzo e i nomi delle carte fedeltà, dal più recente. Riusare un suggerimento non è una comodità: è ciò che fa sì che «Latte» sia una voce sola e non tre.

## La campanella

Un gruppo nuovo, `lista`, con l'etichetta «Lista della spesa». **Nasce acceso** anche sui dispositivi che hanno già toccato le spunte, perché da ADR-0054 in `localStorage` si salvano i gruppi **spenti**: la v2 esiste proprio per questo, e questo è il primo gruppo che ne raccoglie il beneficio senza lavoro.

`list-add`, `list-edit` e `list-delete` fanno una riga. `list-take` e `list-untake` sono **muti**: venti righe «ha preso una cosa» non sono novità, sono rumore, e sarebbero il rumore più frequente dell'app. Il silenzio si ottiene con un insieme `SILENT_KINDS` filtrato **dentro `noticesOf`**, non nel foglio: il numero sul pallino è la lunghezza di quell'elenco (→ ADR-0052), quindi filtrare altrove farebbe promettere al pallino righe che il foglio non mostra — è già successo, misurato 23 contro 21. Verificato che `NewsSheet` non usa `Change.count`, quindi le due grandezze non possono divergere per quella strada.

Il vocabolario del commit resta completo per tutte e cinque (il test di parità lo pretende, e `git log` deve restare leggibile): «cosa aggiunta alla lista», «cosa presa», «cosa rimessa in lista», «voce della lista modificata», «voce della lista eliminata». **I titoli non entrano nel messaggio**, come per le spese: il repo è pubblico e `git log` lo legge chiunque, per sempre (→ ADR-0051, ADR-0067). Un commit dice quante cose, non quali.

## Il prerequisito: un commit prima, con la sua verifica

**La campanella scarica il dettaglio anche per un commit che non tocca le spese.** Per ogni novità non letta (fino a cinque) `loadDetail` scarica e decifra due file da 375 kB, e per un commit di lista — come per uno di prezzi, carte, tricount o configurazione — il confronto è vuoto per costruzione. È un difetto **preesistente**, già scritto fra le cose da fare, e la lista lo rende insostenibile: una spesa di Federica sarebbe una ventina di commit, cioè qualche megabyte scaricato dal tuo telefono alla prima apertura, e un morso alle sessanta richieste all'ora che GitHub concede senza token.

La guardia è una riga — salta il dettaglio se il commit non ha toccato il gruppo `spese` — ma cambia il comportamento anche degli altri gruppi, quindi va **prima e in un commit suo**, con la sua verifica e il suo ADR (→ ADR-0087).

## Il lavoro, in ordine

1. **La guardia del dettaglio** (commit a sé, con ADR). Sopra.
2. **Il dominio**: `src/domain/shopping.ts` — `ShoppingItem`, `qtyLabel`, `SHOPPING_UNITS`, `toBuy`/`inCart` con i loro ordinamenti, `storeSections` (la regola dei due negozi), `bestKnownPrice`, `validateShoppingItem`. Logica pura, con `src/domain/shopping.test.ts`.
3. **I tipi**: `ShoppingItem`, `ShoppingFile`, `GithubConfig.shoppingPath` in `src/domain/types.ts`.
4. **La coda**: le cinque operazioni in `Op`, `isEntry`, `applyShoppingOps`, `fileOf`, `isAlreadyApplied`, `targetOf`, `OP_WORDS`, e l'annullamento della coppia pendente. Test in `src/data/outbox.test.ts`, compreso il giro completo in `localStorage`.
5. **Lo store**: il quarto envelope all'avvio (facoltativo, con il ramo `<` del server di sviluppo), `addShoppingItem` / `editShoppingItem` / `takeShoppingItem` / `untakeShoppingItem` / `deleteShoppingItem`, il ramo `withShopping` in `flushOnce`, e `refreshShopping()` per la sonda dall'API.
6. **La campanella**: il gruppo `lista`, le frasi, `SILENT_KINDS`. Test in `src/domain/changes.test.ts`.
7. **L'interfaccia**: `src/pages/Lista.tsx`, `src/components/ShoppingForm.tsx`, `src/components/ShoppingSheet.tsx`, la voce in `NAV` e in Esplora, il quarto verbo del `+`, la rotta in `App.tsx`, gli stili in `components.css` (riusando `.list`, `.list-row`, `.list-day` per le intestazioni di negozio).
8. **Gli script**: `validateShopping` in `validate-core.mjs` con il test di parità contro il dominio, il quarto file in `publish.mjs`, `decrypt.mjs`, `validate.mjs`, e una lista credibile in `seed.mjs` — con qualcosa nel carrello, o il carrello sarebbe una cosa che nessuno vede mai.
9. **La documentazione**: quattro ADR (sotto), le invarianti in `CLAUDE.md`, la riga dei quattro file cifrati nel README.
10. **Il banco**: `npm run dev` sui dati di esempio, e una prova sui dati veri con la passphrase di comodo su una porta nuova (la porta nuova non è un dettaglio: una porta già usata eredita la coda in `localStorage` di quel banco, che si riapplicherebbe sopra i dati veri).

## Gli ADR

Uno per decisione, secondo la regola del progetto:

- **ADR-0087** — Il dettaglio di una novità si scarica solo se il commit tocca le spese (il prerequisito, già scritto).
- **ADR-0088** — La lista della spesa è un quarto file cifrato.
- **ADR-0089** — Il carrello è il catalogo dei prodotti, e la lista è solo ciò che resta da prendere (il modello di Bring).
- **ADR-0090** — Il file della lista si legge dall'API mentre la pagina è aperta.
- **ADR-0091** — Le spunte non sono novità, e due spunte ancora in coda si annullano.

## Conseguenze, comprese quelle scomode

- **Una spesa sono venti o venticinque commit**, di pochi kilobyte l'uno: qualche megabyte all'anno nella storia pubblica, e altrettanti workflow da quaranta secondi in coda. Il repo regge; a soffrire è la freschezza del sito, ed è la ragione per cui la lista si legge dall'API.
- **Due telefoni che spuntano insieme si scontrano.** Il commit poggia sulla versione che ha letto (→ ADR-0071): se l'altra persona committa nella finestra, GitHub risponde `422` e il salvataggio **ritenta una volta**. Se anche il ritentativo perde, la voce resta in coda e il giro successivo riparte: niente si perde, ma la spia della sincronizzazione lampeggia. Non aumento i tentativi, perché la coda è già la rete di sicurezza.
- **La lista è di casa**, come i prezzi e le carte: la pagina ignora `view.person`. Non esiste una lista privata, e se un giorno servisse la strada è quella dei tricount — dei titolari sulla voce — con un ADR suo.
- **Offline diventa urgente.** Le scritture offline funzionano già (la coda vive in `localStorage` e parte quando torna la rete), ma **l'app deve essere già aperta**: il guscio e i file cifrati si scaricano a ogni apertura con `cache: 'no-store'`, quindi in un reparto senza segnale la lista non si apre. Vale per tutta l'app e resta un commit suo con un ADR suo, come già scritto fra le cose da fare; la lista è l'argomento che lo rende non più rimandabile. Nel frattempo la regola pratica è aprire l'app prima di entrare.

## Cosa resta fuori, di proposito

Non sono dimenticanze: sono cose valutate e scartate, e sapere perché serve a non rifarle per abitudine.

- **Riconoscere la quantità scritta nel titolo** («3 mele» → qty 3). Sbaglia su «Pasta 500 g», dove il numero è la confezione e non la quantità, e un errore silenzioso su un campo che si legge alla cassa costa più di quanto valga il tocco risparmiato.
- **Reparti e corsie.** Bring li ha perché ha un catalogo di prodotti con le categorie dentro; qui il titolo è testo libero, e chiedere il reparto a ogni aggiunta sposterebbe il costo sul gesto che deve restare veloce.
- **Liste multiple** (settimanale, ferramenta, regali) e **liste per persona**. Una lista sola è ciò che è stato chiesto, e il negozio sulla voce copre il caso vero — «questo lo prendo alla Coop».
- **Le ricorrenze** («ogni settimana il latte»). Il carrello come catalogo le rende quasi inutili: la cosa si riaggiunge con un tocco, e un promemoria che riempie la lista da sé è un modo di farla smettere di dire il vero.
- **La condivisione con chi non ha l'app.** Vorrebbe un file in chiaro o un servizio terzo, cioè l'opposto di tutto il progetto.
- **I gesti di scorrimento** sulle righe. Un tocco spunta, un tocco lungo apre: due gesti bastano, e uno scorrimento nascosto su una pagina che scorre è il modo di spuntare la cosa sbagliata.

## Le decisioni prese nell'intervista, il 03/09/2026

1. **Ogni spunta è un commit** — e una spunta si può togliere: «è come se non fosse stata mai messa». Da qui l'annullamento della coppia ancora in coda.
2. **Tutte e sette le proposte** dell'intervista entrano: memoria dei prodotti (che il modello di Bring ha poi assorbito nel carrello), prezzo migliore noto, supermercati suggeriti, sezioni per negozio, aggiunta a sessione, campanella con le spunte mute, guardia del dettaglio in un commit prima.
3. **Il modello di Bring**: la lista è solo ciò che resta da prendere, il carrello è ciò che è stato preso — «che sia appena stato preso oppure mesi fa» — e si torna in lista rimettendo la voce.
4. **La lista si legge dall'API**, non dal sito, mentre la pagina è aperta.
