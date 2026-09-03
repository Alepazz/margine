# ADR-0088: La lista della spesa è un quarto file cifrato

**Status:** accepted · **Date:** 2026-09-03

## Context

Alessio, il 03/09/2026: «Vorrei aggiungere nella tab esplora la possibilità di segnare le cose che si devono comprare quando si va a far la spesa. Deve essere comodo aggiungere la necessità di un prodotto e deve essere comoda la consultazione della lista stessa, con tanto di check delle cose che si sono prese». Con quantità numerica o a peso, il negozio facoltativo, e **il titolo come unico campo obbligatorio**.

Una lista della spesa porta con sé una proprietà che nessun altro dato dell'app ha: **cambia venti volte in mezz'ora**. Ogni cosa presa alla cassa è una scrittura, e in un'app che committa ogni modifica nel repo questo cambia i conti di dove il dato deve vivere.

I posti possibili erano quattro, e tre si escludono:

- **In `Dataset`, accanto a `prices`.** `import.mjs` ricostruisce il master da zero ogni mese, quindi tutto ciò che nasce nell'app e vive in `Dataset` va ricopiato a mano nell'import o la sessione mensile lo cancella in silenzio: è già una cosa da ricordare per rimborsi e prezzi (→ ADR-0041), e sarebbe la terza. E `expenses.json.enc` pesa 367 kB: ogni spunta ne riscriverebbe il contenuto intero, perché ogni cifratura usa un IV nuovo (→ ADR-0025).
- **In `AppConfig`.** Il file è piccolo e già scrivibile, ma la configurazione è configurazione: categorie, entrate, saldo di partenza, repo. Una lista che cambia venti volte al giorno dentro il file che descrive com'è fatta l'app non è quello.
- **Nel file delle carte**, che è già «la roba del negozio». Ma quel file porta le facce delle tessere: 75 kB di immagini che verrebbero ricifrate a ogni tocco alla cassa.
- **Un quarto file.** Costa che ogni posto che gestiva tre file ne gestisca quattro.

## Decision

`public/data/shopping.json.enc`, **un quarto envelope**, con `ShoppingFile { version, updatedAt, items: ShoppingItem[] }`. `GithubConfig.shoppingPath` è facoltativo come `configPath` e `cardsPath`, con la stessa regola — non si indovina un percorso su cui poi si committa (→ ADR-0024) — e la stessa aggravante delle carte: il file può non esistere, quindi un percorso sbagliato lo **creerebbe**. La prima voce lo crea riusando la `kdf` già in mano (`kdfRef`), perché i quattro file condividono il salt di proposito: l'app deriva **una** chiave invece di quattro, e 600.000 iterazioni su un telefono non sono gratis.

```
ShoppingItem { id, title, qty?, unit?, store?, note?, wantedAt, takenAt? }
```

Le scelte dentro il modello:

- **Il titolo è l'unico campo obbligatorio**, per richiesta esplicita. Una lista della spesa si scrive di corsa e con una mano.
- **Lo stato è una data, non un booleano.** `takenAt` assente vuol dire «da prendere», presente vuol dire «nel carrello», e la sua ora ordina il carrello. Un booleano più una data direbbero la stessa cosa due volte, e prima o poi si contraddirebbero.
- **`wantedAt` è il suo simmetrico**: quando la cosa è entrata o rientrata in lista. Serve perché riprendere una voce dal carrello non la muove di posto nell'array — quindi senza questo campo una cosa richiesta un minuto fa comparirebbe in fondo, fra quelle di due settimane prima. Non si muove correggendo la quantità: modificare non è richiedere di nuovo. (Nel piano il campo si chiamava `addedAt`; è diventato `wantedAt` implementando, quando è stato chiaro che serviva simmetrico a `takenAt`. La data di nascita resta nell'id, che la porta.)
- **Cinque unità e non tre** come i prezzi (`kg | l | pezzo`): in una lista si scrive quello che si compra — «500 g di macinato», «una bottiglia da 500 ml» — mentre un prezzo a scaffale è per legge riferito all'unità grande. Convertire fra le due non serve, perché il collegamento con l'osservatorio dei prezzi è il **nome** e ogni riga dichiara la sua unità.
- **Due asimmetrie sulla quantità**, e sono decisioni: una quantità **senza** unità si accetta e si legge come pezzi (si sa cosa fare); un'unità **senza** quantità si rifiuta, perché «kg di mele» non vuol dire niente. E la quantità si cancella con **zero**, non con la stringa vuota: è un numero, e zero è un valore che sopravvive a `JSON.stringify` — nella coda vive in `localStorage` — e che non vuol dire niente su una cosa da comprare. Togliendo la quantità cade anche l'unità: sono un campo solo in due pezzi.

Nella coda cinque operazioni: `list-add`, `list-edit`, `list-take`, `list-untake`, `list-delete`. `fileOf` guadagna il valore `'shopping'` e `RemoteView` una chiave **obbligatoria** `shopping`; il compilatore ha fatto il suo lavoro e ha fermato la compilazione nei quattro posti che le invarianti dicono di non dimenticare, `GROUP_OF` e `PHRASES` della campanella compresi.

`list-take` e `list-untake` **non** sono un `list-edit` su `takenAt`, e sono l'operazione più frequente dell'app: separarle è ciò che permette al messaggio di commit di dire «1 cosa presa» invece di «1 voce modificata», e alla campanella di tacerle (→ ADR-0091). Portano l'istante **dentro** l'operazione invece di leggere l'orologio al momento di applicarla: riapplicate dopo un ricaricamento darebbero un istante diverso, e l'ordine del carrello cambierebbe sotto gli occhi.

E `isAlreadyApplied` per quelle due guarda **lo stato, non l'istante**: se la cosa l'ha presa anche l'altra persona il `takenAt` nel repo è il suo, quindi confrontando gli istanti la propria operazione non risulterebbe mai applicata e resterebbe in coda quattordici giorni, riapplicandosi a ogni caricamento. Quello che conta è che la voce sia nel carrello.

## Consequences

L'app scarica un file in più a ogni apertura: pochi kilobyte, e il costo si annulla quando funzionerà offline.

`decrypt`, `publish`, `validate`, `seed`, la coda e lo store gestiscono quattro file invece di tre. La chiave resta **una**.

**La lista è di casa**, come i prezzi e le carte: la pagina ignora `view.person`, ed è la terza dell'app a farlo. Non esiste una lista privata; se un giorno servisse, la strada è quella dei tricount e sarebbe un ADR suo.

Il conto delle scritture, che è la conseguenza vera: **una spesa sono venti o venticinque commit** di pochi kilobyte l'uno. Il repo regge (qualche megabyte all'anno di storia), e a soffrire è la freschezza del sito — misurato il 03/09/2026: i deploy di GitHub Pages stanno in coda uno alla volta e durano dai 31 ai 51 secondi. È la ragione per cui la lista si rilegge dall'API (→ ADR-0090).

E due telefoni che spuntano insieme si scontrano: il commit poggia sulla versione che ha letto (→ ADR-0071), quindi se l'altra persona committa nella finestra GitHub risponde `422` e il salvataggio ritenta una volta. Se anche il ritentativo perde, la voce resta in coda e il giro successivo riparte: niente si perde, ma la spia della sincronizzazione lampeggia. I tentativi restano due, perché la coda è già la rete di sicurezza.
