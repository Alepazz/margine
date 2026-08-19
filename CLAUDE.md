# Margine — istruzioni di progetto

Cruscotto personale delle spese di Alessio, alimentato dai tricount (spese fisse condivise, personali, altre condivise, e uno per ogni vacanza). L'altra persona è **Federica**.

**Prima di una scelta tecnica o architetturale, leggi [`docs/adr/`](docs/adr/).** Contiene le quattordici decisioni che tengono in piedi il progetto, con i vincoli che le hanno forzate. Una decisione nuova che ne cambia una vecchia è un ADR nuovo, scritto nello stesso commit del codice.

## In tre righe

Sito **statico** su GitHub Pages, nessun backend. I dati vivono **cifrati** nel repo (`public/data/*.enc`, AES-256-GCM con passphrase) e vengono decifrati nel browser. Le spese entrano da una **sessione di import mensile** fuori dall'app ([`docs/import.md`](docs/import.md)); l'unica cosa che l'app scrive da sé sono le **annotazioni 730** (tag, note, link agli scontrini su Drive), che committa via API GitHub.

## Invarianti da non rompere per distrazione

- **Il denaro si somma solo con `src/domain/money.ts`** (centesimi interi). Un `reduce((a, b) => a + b)` su importi reintroduce l'errore in virgola mobile, in silenzio, e rompe la riconciliazione con Tricount. → ADR-0008
- **Le quote sommano sempre esattamente all'importo.** `shares: { me, partner, others? }`, garantito dalla validazione a ogni import. → ADR-0007, ADR-0012
- **«Quanto abbiamo speso» è `me + partner`, mai `amount`.** In vacanza con altri il conto è più grande di quello che avete pagato: si usa `coupleShare` / `totalCouple`. `totalAmount` è il fatturato, e serve solo a riconciliare con Tricount. → ADR-0012
- **`welfare: true` toglie la spesa dal budget di chi l'ha anticipata**, non dagli elenchi né dal costo di una vacanza, e **solo per lui**: per l'altra persona la quota resta un'uscita, perché la rimborsa in contanti. Il filtro sta in `fundedByWelfare()`, applicato una volta in `visibleFor()`. → ADR-0014
- **Un'entrata entra nel profilo se e solo se ciò che paga è tracciato come uscita.** I buoni pasto stanno a zero perché i pranzi che pagano non sono nei tricount; contarli gonfierebbe il margine contro spese che non esistono. → ADR-0014
- **La categoria si ricava dalla descrizione**, con la tabella `RULES` in `scripts/from-tricount.mjs`, dove **l'ordine è logica**: il gatto prima del cibo, i trasporti e il cibo prima dello sport. Il campo `category` di Tricount non si usa. → ADR-0013
- **La tassonomia sta in `scripts/lib/taxonomy.mjs`**, e `data/config.json` ne è una copia perché contiene anche entrate e token. `npm run validate` avvisa se divergono: sono già divergite una volta, in silenzio.
- **Ogni categoria ha uno `slot` di colore fisso** (0-7) in `config`. Il colore appartiene alla categoria, non alla sua posizione in classifica; le categorie senza slot confluiscono in «Altre voci». L'ordine delle tinte è validato per contrasto e daltonismo: non si riordina a occhio. → ADR-0009
- **Le vacanze stanno fuori dalle statistiche mensili** per impostazione predefinita, e sempre dentro nelle pagine Spese, Vacanze, 730 e Gatto. → ADR-0010
- **Il mese in corso si confronta con la sua proiezione**, non con il parziale; la media storica esclude il mese in corso e conta i mesi vuoti. → ADR-0011
- **Colori, raggi, font e vetro solo via i token di `src/styles/tokens.css`.** Niente esadecimali, niente `px` di raggio, niente font ad hoc nei componenti. Se serve qualcosa che non c'è, prima si aggiunge il token.
- **I dati in chiaro non entrano nel repo.** `data/` e `.secrets/` sono in `.gitignore`; nel repo va solo `public/data/*.enc`.

## Ergonomia: prima il telefono

L'app si usa in piedi, con un pollice, e in secondo luogo dal Mac.

- Bersagli tappabili ≥ 44px, campi di testo a **16px esatti** (sotto, iOS ingrandisce la pagina al focus).
- La scala su telefono si regola con **una sola manopola**, `html { font-size }` nel blocco mobile di `base.css`: il contenuto è in `rem` e cresce da lì, la cornice (altezze minime, bordi, raggi, safe-area) resta in px.
- Navigazione a **isola fluttuante in vetro** in basso, staccata dai bordi, con `env(safe-area-inset-bottom)`.
- Il vetro (`--glass-*`) è per la **cornice** — testata, barra, non i contenuti: una superficie semitrasparente sotto il testo che si legge diventa grigio sporco.
- Nel foglio di dettaglio i pulsanti sono a tutta larghezza; le coppie etichetta/valore usano `.kv`, non una tabella (su schermo strettissimo una tabella spezza le etichette su quattro righe).

## Struttura

```
src/domain/      logica pura, testata: types, money, dates, selectors, income, categories, export
src/data/        envelope + crypto (WebCrypto), outbox (coda annotazioni), github, store (contesto React)
src/components/  AppShell, Gate, Controls, MarginMeter, ExpenseList, ExpenseSheet, ui, charts/
src/pages/       Home · Spese · Gatto · Vacanze · Tax730 · Impostazioni (+ usePageData)
scripts/         from-tricount, import, validate, encrypt, decrypt, seed, make-icon (+ lib/)
```

La logica statistica sta **tutta** in `src/domain/`, senza React: è il posto dove aggiungere calcoli e dove i test hanno senso. `usePageData()` prepara ciò che serve a quasi tutte le pagine (lookup delle categorie, spese filtrate per vista, serie mensile).

## Cifratura: due implementazioni, un formato

`src/data/crypto.ts` (browser, WebCrypto) e `scripts/lib/crypto-node.mjs` (Node) scrivono lo **stesso** envelope. Un test in `src/data/crypto.test.ts` cifra con una e decifra con l'altra: se le due divergono, quel test cade. Non modificarne una sola.

## Prima di committare

Vale la regola globale: `/simplify`, poi una review strutturata del diff, poi si risolve, poi si committa. Gli ADR delle decisioni prese nel commit fanno parte dello stesso commit.

## Cose che restano da fare

- **Profilo entrate reale.** Oggi in `data/config.json` ci sono valori di esempio, marcati come tali nel campo `note`: stipendio netto, buoni pasto, mensilità aggiuntive, bonus. Finché restano quelli, il margine e il semaforo sono indicativi — tutto il resto (spese, medie, categorie, confronti) è vero.
- **Il margine sui mesi vecchi.** Le entrate sono un valore unico e corrente, ma i dati partono da ottobre 2024: se lo stipendio è cambiato, il margine dei mesi passati è approssimato. Per farlo giusto servirebbe una serie di periodi di reddito, e un ADR.
- **Le date dei viaggi** in `TRIPS` (in `scripts/from-tricount.mjs`) sono dedotte dal grappolo di spese sul posto, non dai primi pagamenti: da confermare con chi c'era.

Fatto il 19/08/2026: primo import dei dati veri (1253 voci da otto tricount, ottobre 2024 → agosto 2026, riconciliate al centesimo).
