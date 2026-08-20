# Margine — istruzioni di progetto

Cruscotto personale delle spese di Alessio, alimentato dai tricount (spese fisse condivise, personali, altre condivise, e uno per ogni vacanza). L'altra persona è **Federica**.

**Prima di una scelta tecnica o architetturale, leggi [`docs/adr/`](docs/adr/).** Contiene le ventitré decisioni che tengono in piedi il progetto, con i vincoli che le hanno forzate. Una decisione nuova che ne cambia una vecchia è un ADR nuovo, scritto nello stesso commit del codice.

## In tre righe

Sito **statico** su GitHub Pages, nessun backend. I dati vivono **cifrati** nel repo (`public/data/*.enc`, AES-256-GCM con passphrase) e vengono decifrati nel browser. Lo storico è entrato con una **sessione di import** fuori dall'app ([`docs/import.md`](docs/import.md)), che resta la via per i tricount; ma dall'app si **aggiunge, corregge ed elimina** una spesa, si crea un viaggio, si registra un rimborso e si annota per il 730 — tutto committato via API GitHub riscrivendo il file cifrato. → ADR-0018

## Invarianti da non rompere per distrazione

- **La pagina Casa mostra due insiemi, non uno.** Il tricount `houseSource` e la categoria `houseCategory` non coincidono: nel tricount ci sono telefonia e auto, e 58 spese di casa stanno in un altro tricount. Unirli in un solo elenco conterebbe due volte le 46 voci nell'intersezione, in silenzio. → ADR-0017
- **La coda in `src/data/outbox.ts` è un registro di operazioni**, non una lista di annotazioni: `patch | create | update | delete | trip | settle | unsettle`, applicate in ordine di `ts`. Un tipo nuovo va gestito in `applyOps` **e** in `isAlreadyApplied`, altrimenti la voce resta in coda per sempre. → ADR-0018
- **I preset di divisione parlano dal punto di vista di chi guarda, `shares` ha due chiavi fisse.** La traduzione sta solo in `sharesFor()`: scambiare le due quote è l'errore più facile e più silenzioso di tutto il progetto. → ADR-0018
- **Il centesimo dispari di una metà va a chi ha pagato**, non a chi guarda: è la regola con cui Tricount calcola il saldo, e una regola che dipende da chi guarda dividerebbe la stessa spesa in due modi. Vive in tre posti che devono concordare — `splitFor()`, `sharesOf()` in `from-tricount.mjs`, e i dati già importati. Il test non prova la convenzione, prova che **la divisione non cambi secondo chi ha l'app in mano**. → ADR-0023
- **Le regole di una spesa vivono due volte** — `src/domain/expense-rules.ts` per il modulo, `scripts/lib/validate-core.mjs` per l'import — e un test in `scripts/lib/expense-rules-parity.test.mjs` prova che concordano. La garanzia è in una direzione: **ciò che l'app accetta, l'import lo accetta**. → ADR-0018
- **Il saldo non passa da `visibleFor()`.** Vuole *tutte* le spese: il welfare toglie la spesa dal budget di chi l'ha anticipata, ma la quota dell'altra persona è debito comunque. Il segno è fisso (positivo = `partner` deve a `me`) e lo gira la pagina, non il calcolo. E il saldo **non tocca il margine**: le spese contano già solo la propria quota. → ADR-0019
- **Il saldo è per tricount, e `balance.opening` non è il saldo di partenza.** Tricount tiene un saldo per gruppo, e ci si salda un gruppo alla volta: i punti di partenza stanno in `balance.groups` (chiavi `fisse` | `condivise` | `personali` | `vacanze/<idViaggio>`). La data generale si eredita, **l'importo no**: ereditare `opening` per gruppo lo conterebbe una volta per tricount e il saldo triplicherebbe in silenzio — c'è un test che lo presidia. Un gruppo non dichiarato non ha un numero confrontabile con Tricount, e la pagina lo dice invece di mostrare uno zero. → ADR-0022
- **Il denaro si somma solo con `src/domain/money.ts`** (centesimi interi). Un `reduce((a, b) => a + b)` su importi reintroduce l'errore in virgola mobile, in silenzio, e rompe la riconciliazione con Tricount. → ADR-0008
- **Le quote sommano sempre esattamente all'importo.** `shares: { me, partner, others? }`, garantito dalla validazione a ogni import. → ADR-0007, ADR-0012
- **«Quanto abbiamo speso» è `me + partner`, mai `amount`.** In vacanza con altri il conto è più grande di quello che avete pagato: si usa `coupleShare` / `totalCouple`. `totalAmount` è il fatturato, e serve solo a riconciliare con Tricount. → ADR-0012
- **`welfare: true` toglie la spesa dal budget di chi l'ha anticipata**, non dagli elenchi né dal costo di una vacanza, e **solo per lui**: per l'altra persona la quota resta un'uscita, perché la rimborsa in contanti. Il filtro sta in `fundedByWelfare()`, applicato una volta in `visibleFor()`. → ADR-0014
- **Il numero grande è lo spendibile, non il residuo.** `entrate − risparmio − fisse attese − variabili già spese`: le fisse che non sono ancora arrivate sono soldi già impegnati. A mese chiuso la formula collassa in `marginAfterSavings`, e un test presidia quell'uguaglianza perché è ciò che garantisce che la storia non si muova. → ADR-0015
- **I guadagni si oscurano azzerando i campi in `marginView()`, non velandoli nel componente.** La lista `PUBLIC_MARGIN_FIELDS` è di ciò che **resta visibile**, quindi un campo nuovo in `MarginResult` nasce coperto; il test la riscrive a mano di proposito, così allargarla fa cadere qualcosa. Nascondere solo «entrate» non serve a niente: margine + speso le restituisce. → ADR-0016
- **Il contorno delle terre del mappamondo è generato, non importato.** `npm run globe` scrive `src/domain/globe-land.ts` da `world-atlas`; quel file **non si modifica a mano**. `world-atlas` e `topojson-client` restano dipendenze di sviluppo: nel pacchetto entra il dato, non la libreria. La proiezione ortografica è trenta righe in `domain/globe.ts` invece di `d3-geo`, e i gradi non diventano mai radianti fuori da quel file. → ADR-0020
- **Il mappamondo parte inquadrato sui viaggi, non a zoom 1.** Cinque viaggi europei a zoom 1 cadono in 48×70px e due di essi a 8px: i puntini si sovrappongono e mirarli è impossibile. `fitMarks()` stringe finché il più lontano non sta al 62% del raggio. Il test che lo presidia misura **la distanza minima fra due puntini** con le coordinate vere, non l'avvicinamento: è la grandezza che descrive il difetto. → ADR-0021
- **`data-example/` è generato da `scripts/seed.mjs`, non si modifica a mano.** Anche `data-example/config.json`: `seed` lo riscrive, quindi una modifica a mano sparisce al primo `npm run seed`. La configurazione di esempio si cambia nello script.
- **Chi guarda sta nella testata dell'app, non nelle pagine.** Era ripetuto in sei testate: `PersonButton` è uno solo, e `view.person` resta la lente globale.
- **`--tabbar-h` si misura, non si calcola.** L'altezza dell'isola dipende da glifo, etichetta e scala del carattere: la pubblica `AppShell` con un ResizeObserver. Un `calc` in CSS la sbagliava di 6px, e prima un numero a mano di 38.
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
src/domain/      logica pura, testata: types, money, dates, selectors, income, categories,
                 expense-rules, ids, globe, export · globe-land.ts è generato
src/data/        envelope + crypto (WebCrypto), outbox (registro operazioni), github, store (contesto React)
src/components/  AppShell, Gate, Controls, MonthStrip, MarginMeter, ExpenseList,
                 ExpenseSheet, ExpenseForm, ui, charts/ (compreso Globe)
src/pages/       Home · Spese · Casa · Gatto · Vacanze · Tax730 · Saldo · Impostazioni
                 (+ usePageData)
scripts/         from-tricount, import, validate, encrypt, decrypt, seed, make-icon,
                 make-globe (+ lib/)
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
- **I punti di partenza dei tricount sono dichiarati tutti** (20/08/2026), quindi il totale non è più parziale: `fisse` [cifra rimossa], `condivise` mai saldato — parte da prima della prima voce e i dati fanno −[cifra rimossa] come Tricount — e le cinque vacanze tutte saldate. Il tricount personale non ne ha bisogno: non ha mai una quota dell'altra persona. Saldo netto: **−[cifra rimossa]**. → ADR-0022
- **Federica non ha accesso.** Una passphrase sola copre tutto il file, quindi darle l'app vorrebbe dire darle anche le spese personali. Per il saldo condiviso servirebbe una cifratura per persona: è un ADR a sé.

Fatto il 19/08/2026: primo import dei dati veri (1253 voci da otto tricount, ottobre 2024 → agosto 2026, riconciliate al centesimo).
