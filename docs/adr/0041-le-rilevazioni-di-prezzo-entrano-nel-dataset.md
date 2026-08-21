# ADR-0041: Le rilevazioni di prezzo entrano nel dataset cifrato, come fatti condivisi

**Status:** accepted · **Date:** 2026-08-21

## Context

Federica ha chiesto di poter annotare quanto costano i prodotti nei vari supermercati — non gli acquisti, il **prezzo unitario a scaffale**: «passata di pomodoro, 2,15 €/kg, Esselunga, 21 agosto». Prima si raccoglie, poi, davanti allo scaffale, si consulta l'elenco e si vede quanto costava altrove.

Non è una spesa, e la differenza non è terminologica: una rilevazione non ha quote, non ha un pagante, non appartiene a un tricount, e non deve toccare né il margine né il saldo né le statistiche. È un'osservazione datata, e l'unica cosa che deve garantire è di essere confrontabile con le altre.

Dove metterla erano tre strade, e Alessio ha scelto la prima:

- **Dentro `expenses.json.enc`**, come un array in più nel dataset. Coda delle operazioni, commit atomico, cifratura e sblocco esistono già e non vanno toccati.
- **Un terzo file cifrato** (`prices.json.enc`): più pulito da guardare, ma tocca lo store, gli script di cifratura, il seed e la configurazione del repo — più lavoro per lo stesso risultato.
- **Un file in chiaro**: diffabile e leggibile, ma il repo è pubblico, e l'elenco dei supermercati dice dove fa la spesa una famiglia. Avrebbe anche introdotto un secondo canale di scrittura da tenere allineato al primo.

Sull'identità dei prodotti la scelta era fra un elenco gestito in Impostazioni e il testo libero con i suggerimenti. Alessio: testo libero, «chiaramente inizialmente le liste di prodotti e supermercati saranno vuote e poi man mano che vengono aggiunti supermercati e prodotti verranno riproposti».

## Decision

```
PriceEntry { id, product, store, unit: 'kg' | 'l' | 'pezzo', price, date, note? }
```

sta in `dataset.prices`. Il campo è **additivo**: i file cifrati scritti prima non ce l'hanno e si normalizzano a lista vuota all'ingresso, come `settlements` dopo l'ADR-0019 — nessuna migrazione, nessun cambio di `version`. È la differenza fra un campo aggiunto e un campo che cambia forma: il primo si normalizza perché il dato vecchio è ancora vero, il secondo si rifiuta (→ ADR-0037) perché direbbe il falso.

Tre conseguenze del modello, che sono le decisioni vere:

- **Le rilevazioni sono condivise, non di chi le scrive.** Il prezzo del latte non è di nessuno dei due: la pagina ignora `view.person`, e i due telefoni vedono lo stesso elenco. È l'opposto di quello che fa ogni altra pagina dell'app, e proprio per questo va scritto.
- **L'unità è per rilevazione, e il confronto è a parità di unità.** Latte e olio non hanno un prezzo al chilo sensato, e l'etichetta a scaffale riporta €/L; le uova a volte €/pezzo. Lo stesso nome con due unità fa **due gruppi**, perché 2,15 €/kg e 1,80 €/pezzo non si confrontano e affiancarli produrrebbe un «migliore» che non vuol dire niente. La validazione dell'import lo segnala come avviso, non come errore: «uova al pezzo e al chilo» può essere voluto.
- **Si aggiunge e si elimina; non si modifica.** Non esiste un `price-edit`. Una rilevazione è quanto costava quel giorno: correggerla in punta sarebbe riscrivere il passato, mentre cancellarla e rifarla dice la cosa giusta. È anche ciò che rende le due operazioni della coda idempotenti per costruzione.

L'identità di un prodotto è il suo **nome normalizzato** (`nameKey`: senza spazi ai bordi, spazi interni collassati, minuscolo), e vale anche per i supermercati. Gli accenti restano, perché in italiano distinguono parole.

I confronti di prezzo si fanno **in centesimi interi** (→ ADR-0008), e qui non è una formalità: `(2,15 − 2,00) / 2,00` in virgola mobile dà 0,0749999… e arrotonda a «+7%», mentre `(215 − 200) / 200` dà 0,075 e arrotonda a «+8%». Il numero a schermo cambia, quindi c'è un test che lo presidia.

## Consequences

Il lavoro è stato quasi tutto lettura: un file di dominio nuovo (`src/domain/prices.ts`), due operazioni nella coda, due azioni nello store, una pagina, un modulo. Niente di cifratura, niente di sincronizzazione, niente migrazione.

Il prezzo della scelta sull'identità è che **un refuso crea un prodotto nuovo**: «pasata di pomodoro» non si confronta con «passata di pomodoro», e la pagina mostrerà due schede. Non c'è un elenco da correggere — la correzione è cancellare la rilevazione e rifarla. È il costo dichiarato di non avere schermate di gestione, e il suggerimento sotto il campo è ciò che lo rende raro: riusare quello che l'app propone è più veloce che riscriverlo.

Il secondo costo è che il dataset cresce di una lista che con le spese non ha niente a che fare, e chi legge `expenses.json` in chiaro durante la sessione mensile trova un array che non gli serve. In cambio, ogni cosa che riguarda la scrittura — coda, conflitti, commit unico, ripubblicazione di Pages — vale per le rilevazioni senza una riga in più.

Restano fuori, e sono decisioni non dimenticanze: l'andamento nel tempo in un grafico, il collegamento fra una rilevazione e una spesa, il calcolo del prezzo unitario da prezzo confezione e peso, e il funzionamento offline — al supermercato serve la rete, come per il resto dell'app.
