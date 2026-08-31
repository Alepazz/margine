# ADR-0074: Un progetto sta fuori dai conti del mese

**Status:** accepted · **Date:** 2026-08-31

## Context

Alessio e Federica hanno comprato una casa a Senigallia. Le sue spese non sono la vita di tutti i mesi: sono poche voci grandissime — compromesso, rogito, notaio — concentrate in due o tre mesi, e per due anni di dati non è mai esistito niente di simile.

Registrate come spese normali, quelle voci fanno tre danni distinti, e nessuno dei tre è ovvio guardando lo schermo:

- **Il mese in cui cadono smette di essere confrontabile.** Il numero grande del Riepilogo — «puoi ancora spendere» — è entrate meno impegnato, e un capitale lo manda a decine di migliaia di euro sotto zero. Il semaforo dice «oltre», la barra si schiaccia, e per quel mese la pagina non risponde più a nessuna domanda.
- **Ogni media si sposta e non torna più.** `averageMonthly` conta i mesi vissuti: un mese da trentaseimila euro in una serie da milleduecento la porta via da sola, e resta lì per la finestra di dodici mesi delle fisse attese (→ ADR-0056) e per tutta la storia nelle altre. È la stessa famiglia di ADR-0055, dove **una** voce datata per sbaglio nel futuro toglieva una ventina di euro alla media delle fisse.
- **Il saldo di ogni giorno diventa illeggibile.** Diciottomila euro che rientrano a rate in tre anni, sommati al conto della spesa e delle bollette, cancellano per mesi la domanda vera: chi ha pagato l'ultima volta.

Il modello a tricount c'è già (→ ADR-0037) e Alessio ha scelto di usarlo: «la casa è un tricount». Ha anche scelto cosa la pagina deve raccontare — «solo quello che è successo» — quindi niente obiettivo, niente residuo da raggiungere, niente proiezione.

La rata del mutuo è il caso opposto: **è** la vita di tutti i mesi, e prende il posto dell'affitto. Deve erodere il margine come lui.

## Decision

Un tricount può essere un **progetto**: `Tricount.offBudget: true`.

Le sue spese restano spese — negli elenchi, nel 730, nell'archivio della pagina Spese — ma **escono dalle statistiche mensili e dal saldo di ogni giorno**. Non c'è un interruttore che le rimetta dentro, e qui sta la differenza con le vacanze: una vacanza è la vita di ogni anno e ha senso chiedersi quanto pesa (→ ADR-0010), una casa comprata no.

Il filtro sta dove stanno già gli altri: `visibleFor()` prende un **`Perimeter`** invece del solo insieme delle vacanze — `{ vacations, offBudget }`, costruito una volta da `perimeterOf()`. Un oggetto e non due parametri perché sono la stessa domanda, «cosa sta dentro il perimetro di questo mese?», e tenerli separati vorrebbe dire che il giorno che ne nasce un terzo tipo metà dei chiamanti lo riceve e metà no. `coupleBalance()` riceve lo stesso insieme e salta quelle voci.

Il conto del progetto lo fa **`projectStats()`**, che è il saldo di ogni giorno riscritto per un perimetro solo: quanto è costato, chi ha anticipato cosa, quanto spetta a ciascuno, da che parte pende. Non è una duplicazione — il verso lo dà `balanceDeltaOf()`, la stessa funzione — e rispetta la soglia del mese di ADR-0064, perché «solo quello che è successo» è la scelta di Alessio.

Quello che il progetto **continua a costare** è un secondo insieme, dichiarato con `Tricount.recurringCategory`: la categoria in cui la rata vive dentro i conti di tutti i giorni. Quelle spese stanno nel tricount delle fisse, con la spunta ricorrente, e la pagina del progetto le mostra **senza mai sommarle** al costo del progetto. È letteralmente la forma della pagina Casa, dove il tricount e la categoria non coincidono e fonderli conterebbe due volte le voci nell'intersezione (→ ADR-0017); qui l'errore sarebbe peggiore, perché sommerebbe un capitale a una rata.

La rotta è **generica**, `/progetto/:id`, e il nome del progetto arriva dai dati. Il repo è pubblico: «casa a Senigallia» scritto in un file sorgente sarebbe in chiaro in `git log` per sempre, che è esattamente ciò da cui `expenses.json.enc` protegge (→ ADR-0067, ADR-0026).

Il totale non tace. Il Riepilogo, nei mesi che hanno spese di progetto, porta **una riga in più** che dichiara quanto è uscito fuori da quei conti e dove guardarlo; la pagina Saldo fa lo stesso per il debito. Un totale che nasconde è un totale di cui non ci si fida più — la stessa ragione per cui il saldo dichiara le voci rinviate (→ ADR-0064).

La spunta si mette **alla creazione e solo lì**. Cambiarla su un tricount che ha già delle spese sposterebbe di colpo mesi di storia dentro o fuori dalle medie, e nessuno se ne accorgerebbe guardando il Riepilogo: un tricount nato sbagliato si rifà, una media che cambia da sola no.

## Consequences

Il Riepilogo continua a rispondere alla sua domanda anche nel mese del rogito, e le medie non portano cicatrici. La casa ha una pagina dove i suoi numeri significano qualcosa: quanto è costata, cosa ha messo ciascuno, cosa manca.

Le raccolte che misurano una media — Casa, il gatto, e le loro anteprime nell'hub — partono da `everyday`, cioè tutto meno i progetti. Non è teoria: la prima versione lasciava la spesa del compromesso nella categoria «casa», e la pagina Casa se la prendeva sotto «spese di casa fuori dal tricount», falsando media al mese e andamento. **Trovato al banco, non dai tipi**: quelle pagine leggono `dataset.expenses` direttamente, e nessuna firma le obbligava a chiedersi da dove. Il 730 e la pagina Spese restano su tutto, di proposito: il primo detrae anche un rogito, la seconda è l'archivio e non una misura.

I progetti sono **l'unica famiglia di viste dell'hub che non sta in `NAV`**, e non poteva starci: nascono dai dati, e `NAV` è una lista scritta a mano. Le due cose che l'unione discriminata di ADR-0044 garantisce — la voce accesa nella barra e la presenza in colonna — vanno quindi rifatte a mano, ed è perché stanno tutte e due in `AppShell.tsx` e non nelle pagine. Il compilatore qui non presidia niente: una voce di progetto dimenticata nella colonna sparirebbe in silenzio, esattamente il difetto che `NavItem` esiste per escludere.

Le regole di un tricount ora vivono **in due posti** — `expense-rules.ts` e `validate-core.mjs` — come già quelle di una spesa. C'è un test di parità che le tiene d'accordo, e vale la lezione della cifratura (→ ADR-0073): un controllo nuovo va aggiunto ai due lati **e** alla tabella, o le due smettono di dire la stessa cosa senza che nessuno lo veda.

Il campo è additivo: nessuna migrazione, e un file cifrato scritto prima di oggi resta valido. Il progetto della casa lo crea Alessio dall'app, quando vuole.
