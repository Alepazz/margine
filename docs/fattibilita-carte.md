# Fattibilità: la sezione «Carte»

> **Nota del 02/09/2026, a implementazione fatta.** Questo documento è l'analisi *prima* del lavoro, e si tiene com'è per non riscrivere il passato. Due sue raccomandazioni sono state **rovesciate** leggendo il codice, e le ragioni stanno negli ADR: il codice a barre non usa `jsbarcode` ma encoder nostri, verificati con un giro completo attraverso un decodificatore indipendente (→ ADR-0083), e l'id di una carta ha quattro byte casuali come una spesa, non cinque cifre esadecimali (→ ADR-0082). Lo stato corrente è in `CLAUDE.md` e in `docs/adr/`.

Scritto il 02/09/2026, su richiesta di Alessio: «Voglio integrare una sezione "Carte" in cui siano presenti le scansioni di tutte le carte. Praticamente quello che faceva Stocard, e che ora fa molto male Klarna. Le scansioni le ho tutte, quindi possiamo partire da quelle; ma un domani, come evolutiva, voglio la possibilità di scansionarne un'altra e aggiungerla.» Con due schermate di Klarna come riferimento — la griglia di tessere a due colonne con il logo del negozio, e la tessera aperta: fascia colorata con nome e «Dettagli», codice a barre grande su fondo bianco, numero sotto — e una richiesta dichiarata non obbligatoria: che aprendo una tessera lo schermo si illumini da solo.

**Verdetto: si fa.** Tutto ciò che si vede nelle due schermate è realizzabile dentro Margine com'è — sito statico, dati cifrati nel repo, coda di operazioni verso GitHub — con una dipendenza nuova in produzione da 11 kB e una nuova sessione di import al Mac. Due cose non si fanno come chieste, e vanno dette prima del resto: **la luminosità non si può alzare dal browser**, in nessun browser, e al suo posto c'è uno schermo bianco che resta acceso; e **la scansione con la fotocamera resta evolutiva**, perché su iPhone l'API nativa non funziona e la libreria che la sostituisce pesa un megabyte. Le carte che oggi stanno in Klarna entrano invece da subito, e il pezzo che regge quella strada è stato **provato al banco** oggi stesso.

Le «scansioni» della richiesta non sono file: sono le carte già digitalizzate dentro Klarna, e alcune fisiche Alessio non le ha più. La sorgente è quindi Klarna, e il problema è trasportarle.

## Le decisioni prese oggi

Tutte di Alessio, il 02/09/2026, nell'intervista che precede questo documento:

1. **Migrazione da Klarna con screenshot e uno script al Mac.** Uno screenshot per tessera dalla schermata col codice; uno script Node legge da ogni immagine numero **e formato** del codice e scrive le carte nei dati cifrati.
2. **Le carte sono tutte condivise.** Un elenco solo, identico sui due telefoni, come i prezzi (→ ADR-0041). Nessun titolare, la pagina ignora `view.person`.
3. **I loghi ci sono e viaggiano cifrati.** La tessera è l'immagine ritagliata dalla griglia di Klarna — logo e sfondo del marchio in un colpo solo — salvata come immagine dentro il record della carta, nel file cifrato.
4. **«Carte» sta nell'hub Esplora**, in un gruppo suo. La barra non cambia (→ ADR-0044).
5. **L'app funziona offline già nella prima versione.** È un lavoro a parte, per tutta l'app e non solo per le carte, ma entra in questo giro.
6. **Una carta si aggiunge a mano dall'app** fin dalla prima versione: nome, numero digitato, formato, immagine dalla galleria. La scansione con la fotocamera viene dopo.

## Verdetto punto per punto

| Richiesta | Fattibile | Come |
|---|---|---|
| Griglia di tessere con il logo | sì | immagini ritagliate da Klarna, cifrate nel record della carta |
| Tessera aperta con codice a barre e numero | sì | `jsbarcode` disegna un SVG da numero e formato; il numero sotto in cifre tabulari |
| Luminosità automatica | **no** | nessuna API esiste, la proposta è stata abbandonata nel 2022; sostituto: pagina bianca + Screen Wake Lock |
| Portare le carte da Klarna | sì, **verificato** | screenshot + `zxing-wasm` in Node: numero e formato letti in 68 ms da uno screenshot vero |
| Aggiungere una carta a mano | sì | modulo + tre operazioni nella coda (`card`, `card-edit`, `card-delete`) |
| Scansione con la fotocamera | sì, **evolutiva** | `zxing-wasm` nel browser, 1 MiB caricato solo quando si scansiona; l'API nativa su iOS non c'è |
| Consultare alla cassa senza rete | sì, lavoro a parte | service worker per il guscio + copia locale dei file cifrati |

## Cosa vincola, nel codice com'è

Fatti verificati oggi nel repo, che decidono la forma della soluzione:

- **Il repo è pubblico.** Numeri di carta e loghi sono dati personali quanto una spesa: stanno solo nei file `.enc`, mai nel codice, negli ADR o in un messaggio di commit (→ ADR-0067, ADR-0026). Per lo stesso motivo questo documento non nomina i negozi.
- **I file cifrati sono due e il salvataggio ne conosce due.** `flush()` in `store.tsx` decide con `touchesConfig(entry)` se riscrivere `expenses.json.enc` o `config.json.enc`, e `commitFiles` mette già più file in un commit solo (→ ADR-0025). Un terzo file vuole che quel booleano diventi una funzione a tre valori — lavoro contenuto, meccanismo già lì.
- **`expenses.json.enc` pesa 375 kB e la campanella lo decifra in due versioni per ogni novità** (→ ADR-0051). Duecento chilobyte di immagini dentro lo farebbero crescere del 60 % e peserebbero su ogni lettura delle novità. Le carte vanno in un file loro.
- **L'app non ha service worker** e scarica i file cifrati con `cache: 'no-store'` a ogni avvio: senza rete non si apre. È un limite di tutta l'app, non delle carte.
- **Il bundle è 919 kB di JavaScript** (Recharts pesa). `jsbarcode` aggiunge 11 kB compressi; `zxing-wasm` ne aggiungerebbe 1.040 in WebAssembly, ed è la ragione per cui la scansione si carica a richiesta o non si carica.
- **`Card` è già un componente** in `src/components/ui.tsx` (la scheda bianca delle pagine). Il tipo di dominio si chiama `LoyaltyCard`.
- **La navigazione è `HashRouter`** (GitHub Pages non riscrive le rotte): il service worker non ha bisogno di un ripiego di navigazione, basta `index.html` in cache.
- **La passphrase si può ricordare** (spunta in `Gate.tsx`, accesa di partenza) e la derivazione della chiave è locale: aprire i dati senza rete non chiede niente di nuovo.

## Il modello

```ts
interface LoyaltyCard {
  id: string          // carta-<YYYY-MM-DD>-<5 cifre esadecimali>
  name: string        // come lo chiama chi la usa
  code: string        // il testo del codice, così com'è stato letto
  format: 'ean13' | 'ean8' | 'code128' | 'code39' | 'itf' | 'qr' | 'text'
  image?: string      // data URI JPEG, lato lungo 320 px, 10-20 kB
  color?: string      // colore dominante della tessera, calcolato una volta quando l'immagine entra
  note?: string       // numero cliente, PIN, «chiedere alla cassa»
  addedAt: string     // ISO YYYY-MM-DD
}

interface CardsFile {
  version: 1
  updatedAt: string
  cards: LoyaltyCard[]
}
```

- **Condivise per costruzione**: niente titolari, niente quote, niente tricount. La pagina ignora `view.person`, come Prezzi (→ ADR-0041), ed è la seconda pagina dell'app a farlo.
- **`format: 'text'`** è la carta senza codice — quelle che in Klarna si aggiungono «con numero di telefono»: la tessera aperta mostra il numero grande e nessuna barra.
- **`code` è testo, non numero**: un Code 128 può contenere lettere, e uno zero iniziale in un EAN-13 è significativo.
- **L'immagine è la tessera intera**, non il logo su trasparente: è ciò che il ritaglio dalla griglia di Klarna dà gratis, e rende la griglia identica all'originale senza scegliere un colore. `color` serve alla fascia della tessera aperta e si calcola una volta sola — al Mac con `sharp.stats()`, nell'app dal canvas — invece che a ogni rendering.
- **L'id ha cinque cifre esadecimali**, non tre come i prezzi: la collisione dei prezzi (4.096 combinazioni per data, → «Cose che restano da fare» in CLAUDE.md) non si ripete su un tipo nuovo.

## Il terzo file cifrato

`public/data/cards.json.enc`, stessa passphrase e stesso salt degli altri due (così la chiave si deriva una volta, come fa già `publish.mjs`). In `GithubConfig` entra `cardsPath?: string`, facoltativo come `configPath` e con la stessa regola: **non si indovina un percorso su cui poi si committa** (→ ADR-0024); senza, la pagina è in sola lettura e lo dice.

Perché un file e non un campo di `dataset` come `prices`: (1) il peso delle immagini sul file delle spese e sulla campanella, detto sopra; (2) **`import.mjs` ricostruisce il master da zero** e deve ricopiare a mano tutto ciò che nasce nell'app — rimborsi e prezzi — o la sessione mensile lo cancella (→ ADR-0041). Un file separato **non è toccato dall'import**, quindi il problema non esiste invece di andare gestito. È il vantaggio decisivo.

Cosa cambia negli script: `PATHS` guadagna `cards` e `cardsEnc`; `publish.mjs` cifra tre file; `decrypt.mjs` ne decifra tre, con la lezione del 31/08/2026 (prima tutto in memoria, poi si scrive: un errore a metà lasciava `data/` incoerente); `validate-core.mjs` guadagna `validateCards` (formato ammesso, checksum EAN verificata, immagine sotto una soglia, id unici); `seed.mjs` genera tre o quattro carte finte in `data-example/` con immagini generate — senza, la griglia al banco sarebbe vuota e la pagina non si prova.

Nell'app: `fetchEnvelope(CARDS_URL)` accanto agli altri due, con il file **facoltativo** finché la migrazione non l'ha pubblicato (assente → elenco vuoto, non errore); `normaliseCards` come `normaliseDataset`; `flush()` con `targetOf(entry): 'data' | 'config' | 'cards'` al posto di `touchesConfig`.

## La coda

Tre operazioni nuove in `Op`:

```ts
| { kind: 'card'; card: LoyaltyCard }
| { kind: 'card-edit'; cardId: string; fields: Partial<LoyaltyCard> }
| { kind: 'card-delete'; cardId: string }
```

A differenza dei prezzi c'è un `card-edit`, perché una carta è uno **stato** e non un fatto osservato: il nome si corregge, l'immagine si sostituisce, la nota cambia. Vale la regola degli `update`: un campo si cancella con la stringa vuota, non con `undefined`, e `normalize()` fa cadere le chiavi vuote.

Da toccare, tutti insieme o la coda si rompe in silenzio (→ ADR-0018, ADR-0051): `applyCardOps` (nuova, sul file delle carte), `isAlreadyApplied`, `targetOf` (il bersaglio è l'id della carta: le tre operazioni sulla stessa carta stanno in una catena e vince l'ultima, → ADR-0069), `OP_WORDS` con «carta aggiunta / carte aggiunte», «carta modificata», «carta eliminata» — e il test di parità con `changes.ts` cade da solo se manca una parola. In `changes.ts` un gruppo nuovo `'carte'` in `CHANGE_GROUPS` e `GROUP_LABELS`, spuntabile in Impostazioni.

**L'immagine passa dalla coda.** Un `card` con un JPEG da 20 kB mette 27 kB di base64 in `localStorage`, dove Safari concede circa 5 MB: va bene per una carta alla volta, ma è il motivo per cui **il ridimensionamento nel browser è obbligatorio prima di accodare** — una foto da 4 MB dalla galleria non deve mai entrare nella coda com'è.

**Nella campanella la riga è generica** («1 carta aggiunta»), senza il nome: il dettaglio delle novità decifra due versioni del file delle spese (`diff.ts`), e portarlo sul file delle carte è lavoro che non paga per un evento raro. Da fare se un giorno pesa.

## Le pagine

**`/carte` — la griglia.** Due colonne, tessere con il rapporto di una carta vera (85,6 × 54 mm, cioè 1,585), l'immagine a coprire (`object-fit: cover`), raggio dai token. Titolo «12 carte», con il numero vero. Ordinamento alfabetico; in più «usate di recente», che è **un segno del dispositivo** (`margine.cards.lastUsed.v1` in `localStorage`, non nei dati): la carta che usi ogni settimana sale, quella dell'altra persona non si muove sul tuo telefono. Senza immagine la tessera è un rettangolo neutro con il nome in grassetto.

**`/carte/:id` — la tessera aperta.** Una **rotta**, non un foglio: alla cassa serve il gesto «indietro» del sistema e serve poterla raggiungere da un segnalibro. La pagina è **bianca a tutta altezza anche col tema scuro**, perché il lettore ottico vuole contrasto e il bianco intero è la cosa che più somiglia ad alzare la luminosità. Fascia in alto col `color` della carta, nome e pulsante «Dettagli»; codice a barre largo quanto la pagina meno la zona di quiete; numero sotto, in cifre tabulari a gruppi di tre o quattro. «Dettagli» apre un foglio — **con `.sheet-body`**, → ADR-0030 — con numero, formato, nota, «Modifica» ed «Elimina» (con conferma).

**Il `+` della barra aggiunge la cosa della pagina in cui sei** (→ ADR-0044): su `/carte` e su `/carte/:id` aggiunge una carta, con la stessa mappa per rotta che oggi ha `PRICE_ROUTE`.

**Nell'hub**: gruppo nuovo `'negozio'` («Al negozio») in `NavGroup`, con la sola voce «Carte» (glifo 💳) e l'anteprima «12 carte» — un numero che esce da `cards.length`, quindi non pretende un selettore nuovo, com'è richiesto. `inHub()` deve riconoscere anche `/carte/…` perché il tab Esplora resti acceso dentro una tessera, come già fa per `/progetto/…`. Un gruppo con una voce sola è un po' vuoto; la voce che lo riempirà, se mai, è un collegamento ai Prezzi, ma **non si sposta Prezzi dalla barra**: ADR-0044 l'ha messo lì perché si usa in piedi col carrello, e le carte non cambiano quel giudizio.

**Il modulo** (`CardForm`): nome, numero (campo testo con tastierino numerico ma **non** `type="number"`, che perderebbe gli zeri iniziali), formato a tendina — con **il codice disegnato dal vivo sotto il campo**, così un EAN-13 con la checksum sbagliata o un formato incompatibile si vede subito (`jsbarcode` lancia sull'EAN non valido, e la validazione del dominio lo dice a parole) — immagine dalla galleria con ridimensionamento a 320 px in JPEG sul canvas prima di accodare, nota. La stessa forma serve alla modifica.

## Il codice a barre

**`jsbarcode` 3.12.3** (gennaio 2026, 11 kB compressi, renderer SVG): EAN-13, EAN-8, Code 128 con scelta automatica del sottotipo, Code 39, ITF, UPC. Si rende con `displayValue: false` e il numero lo scrive la pagina, con il font dei token. Scelta rispetto a scriverlo a mano — EAN-13 sono quaranta righe, Code 128 ottanta di tabella, e il precedente di `domain/globe.ts` senza `d3-geo` inviterebbe — perché **qui la correttezza è binaria e si scopre alla cassa**, e una libreria da 11 kB mantenuta è meno rischio di una tabella ricopiata. Merita un ADR.

**QR non è compreso.** Se fra le carte ce n'è una a QR (lo dirà lo script di migrazione, che riporta il formato), si aggiunge `qrcode` (npm, ~20 kB) e il formato `'qr'` prende vita; altrimenti resta nel tipo e la tendina non lo offre. Decisione rinviata a un fatto che ancora non si conosce.

Regole di resa che il lettore ottico impone: **zona di quiete** bianca di almeno dieci moduli ai due lati; **modulo di almeno 2 px** di dispositivo (un EAN-13 ha 95 moduli: a 3 px sono 285 px, che su un telefono da 390 stanno con margine); altezza almeno un terzo della larghezza. Il codice si disegna una volta per tessera e non si ridisegna per il ridimensionamento della finestra: `viewBox`, e lo scala il browser.

## La tessera aperta: bianca e sveglia

Fatto verificato: **nessun browser espone la luminosità dello schermo.** La proposta WICG del 2020 (`Screen.requestBrightnessIncrease()`) è rimasta un explainer, la prova di concetto in Chromium è stata abbandonata il 19/10/2022, e nemmeno un'app web aggiunta alla Home su iOS può farlo. Non è una cosa che «un giorno si farà»: nessuno la sta facendo.

Il sostituto sono due cose che i lettori ottici apprezzano quasi quanto la luminosità: **la pagina bianca a tutta altezza**, e **lo schermo che non si spegne** mentre la tessera è aperta — `navigator.wakeLock.request('screen')` all'apertura, rilascio all'uscita, richiesta di nuovo su `visibilitychange` perché il blocco si perde quando l'app va in secondo piano. Supporto: Safari iOS 16.4 nel browser, e **nell'app aggiunta alla Home solo da iOS 18.4** (31/03/2025, bug WebKit 254545): prima di quella versione la richiesta fallisce in silenzio, e il codice deve trattarla come facoltativa — controllo dell'esistenza, nessun messaggio.

## Portare le carte da Klarna

**Verificato oggi**: lo screenshot della tessera aperta in Klarna, passato a `zxing-wasm` 3.1.3 in Node (con `sharp` per i pixel), restituisce formato EAN-13, tredici cifre coincidenti con quelle stampate sotto il codice, in 68 ms. I codici **disegnati** da un'app si leggono senza incertezze; è sulle foto di plastica con i riflessi che i lettori software faticano (in un banco di prova indipendente su foto difficili zxing legge il 78 % degli EAN-13 e il 32 % dei Code 128), ed è il motivo per cui la strada è lo screenshot e non la foto della carta.

Lo script, `scripts/import-cards.mjs`, legge da `data/incoming/cards/<slug>/` (dentro `data/`, che è in `.gitignore`) due immagini per carta: `codice.png` — lo screenshot della tessera aperta — e `tessera.png` — il ritaglio dalla griglia, fatto con Anteprima. Da esse ricava `code` e `format` (zxing), `image` (sharp: 320 px di lato lungo, JPEG q80, in data URI) e `color` (sharp, colore dominante); `name` viene dal nome della cartella e si corregge dopo dall'app. Scrive `data/cards.json`, e `npm run encrypt` pubblica i tre file. Se una carta non si legge, lo script lo dice e la si inserisce a mano dall'app, che è il ripiego che esiste comunque.

`zxing-wasm` e `sharp` entrano come **dipendenze di sviluppo**, sul modello di `world-atlas`: nel pacchetto entra il dato, non la libreria. `sharp` porta un binario nativo (~30 MB) che `npm ci` scarica anche sul runner del deploy: qualche secondo in più a ogni push, o `optionalDependencies` se disturba.

Le carte di Federica entrano nello stesso elenco, dal suo telefono con il modulo o con i suoi screenshot alla stessa sessione: condivise vuol dire che non c'è un «suo» elenco da creare.

## Offline

È l'unica delle sei decisioni che **allarga il perimetro oltre le carte**: senza rete oggi non si apre niente, e un service worker che tiene il guscio dell'app in cache serve a spese e prezzi quanto alle carte. Va quindi in un commit suo con un ADR suo, prima o dopo le carte ma non mescolato.

Come: **`vite-plugin-pwa` 1.3.0** (maggio 2026, dichiara Vite 8 fra i peer), strategia `generateSW` di Workbox, `registerType: 'autoUpdate'`. In precache il guscio: `index.html`, `assets/*`, i font, il manifest e le icone. **Fuori dalla precache i tre `.enc`**, che si servono con una regola a runtime «prima la rete, poi la cache»: online arriva sempre la versione fresca (il `cache: 'no-store'` di `fetchEnvelope` resta e vale per la richiesta che il worker fa alla rete), offline arriva l'ultima vista. Le chiamate a `api.github.com` non si intercettano: la coda già sopravvive in `localStorage` a un salvataggio fallito e riparte al prossimo `syncNow`, quindi **aggiungere una carta offline funziona da sé** — si accoda, si committa quando torna la rete.

Conseguenze da conoscere: (1) **una versione nuova dell'app arriva all'apertura successiva** a quella in cui il worker l'ha scaricata, non subito — Impostazioni dovrebbe mostrare la versione in uso, o il «ma ho appena pubblicato» diventerà un mistero; (2) la campanella offline fallisce la lettura dei commit e già lo dice (→ ADR-0053), ma la frase deve saper dire «sei offline» e non «limite esaurito»; (3) la cache di Safari **si svuota dopo sette giorni senza uso nel browser**, ma **l'app aggiunta alla Home ne è esente** per dichiarazione di WebKit — Margine sul telefono è aggiunta alla Home, quindi il caso non si presenta.

**Un rischio da verificare in mezz'ora, prima di tutto il resto**: la base relativa `base: './'` di `vite.config.ts`, deliberata perché la stessa build giri in locale, su Pages e su un dominio proprio. `vite-plugin-pwa` costruisce da `base` l'URL del worker e la lista di precache, e con la base relativa si sono visti problemi in passato; la documentazione attuale non lo chiarisce. Se non funziona, il ripiego è la base assoluta `/margine/` — che è una decisione, e vuole il suo ADR.

## La scansione, dopo

Non è nella prima versione, ma la fattibilità va scritta oggi perché fra sei mesi qualcuno proverà «l'API nativa»:

- **`BarcodeDetector` su Safari iOS non c'è.** Presente da iOS 17 solo dietro un flag sperimentale, e da iOS 18 non funziona nemmeno col flag; il bug WebKit 281848 è ancora aperto a luglio 2026, iOS 26 compreso. Su Chrome Android funziona (da Chrome 83) ma richiede i Google Play Services. Non è una strada.
- **La strada è `zxing-wasm`** (3.1.3, agosto 2026, attivo): 14 kB di JavaScript e **1,04 MiB di WebAssembly**, da tenere in `public/` e caricare con `import()` **solo dal pulsante «Scansiona»** — mai nel bundle iniziale, mai in precache. `getUserMedia` con la fotocamera posteriore, un fotogramma ogni 200 ms sul canvas, `readBarcodes()`, e alla prima lettura valida si passa al modulo già compilato con numero e formato. Il modulo manuale resta sotto, come in Klarna: è il ripiego di ogni scanner.
- **Il polyfill `barcode-detector`** (stesso autore, stessa base) darebbe l'API standard sopra zxing, ma di default scarica il wasm da jsDelivr: va in ogni caso configurato per servirlo dal sito, sia per la privacy sia per l'offline.

## Stima e ordine dei lavori

Quattro blocchi, ognuno un commit con i suoi ADR e i suoi test, in quest'ordine perché ogni passo lascia l'app funzionante:

| # | Blocco | Contenuto | Peso |
|---|---|---|---|
| 1 | Modello e terzo file | `LoyaltyCard`, `cards.json.enc`, `cardsPath`, `PATHS`, publish/decrypt/validate/seed, `import-cards.mjs` **e la migrazione vera** | una sessione |
| 2 | Le pagine | `/carte`, `/carte/:id`, `jsbarcode`, wake lock, hub e `+`, ordinamento | una sessione |
| 3 | Scrittura dall'app | `CardForm`, tre operazioni in coda, parità, campanella, ridimensionamento immagine | una sessione |
| 4 | Offline | spike sulla base relativa, `vite-plugin-pwa`, regola per gli `.enc`, versione in Impostazioni | una sessione, separata |
| — | Scansione | evolutiva, quando servirà | una sessione |

Il blocco 1 chiude già la richiesta principale: dopo di lui le carte sono nei dati e si vedono; dopo il 2 si usano alla cassa. Il 3 e il 4 sono indipendenti fra loro.

## Rischi e cose da verificare

- **Base relativa e service worker** (sopra): spike prima di cominciare il blocco 4.
- **Carte a QR**: lo script di migrazione lo scopre; se ce n'è una serve una seconda libreria.
- **Lettori laser**: alcuni lettori a laser non leggono da uno schermo, solo quelli a immagine. È lo stesso limite di Klarna e Stocard, non di Margine: alla cassa, se non passa, si legge il numero a voce — ed è il motivo per cui il numero sta sotto il codice a grandi cifre.
- **Immagini nella coda**: obbligatorio ridimensionare nel browser prima di accodare. Un test sul giro in `localStorage`, come per i campi vuoti degli `update`.
- **Formato letto male**: i codici disegnati si leggono senza ambiguità, ma Code 128 e Code 39 possono contenere lo stesso testo; lo script conserva il formato che zxing dichiara, e il modulo lo mostra disegnato dal vivo. Il primo passaggio alla cassa di ogni carta è il vero test, e va fatto con la carta fisica o con Klarna ancora installata come rete di sicurezza.
- **`sharp` sul runner**: qualche secondo in più a ogni deploy; `optionalDependencies` se disturba.

## ADR da scrivere

Uno per decisione, nello stesso commit del codice (→ regola 3 della convenzione):

1. **Le carte fedeltà stanno in un file cifrato proprio**, non in `dataset` — per il peso sulla campanella e perché l'import non le tocca.
2. **Le carte sono condivise**, la seconda pagina dopo Prezzi che ignora `view.person`.
3. **I loghi viaggiano cifrati come immagini nel record**, ritagliati da Klarna — il compromesso sulle dimensioni e il ridimensionamento obbligatorio.
4. **Il codice a barre lo disegna `jsbarcode`**, non una tabella scritta a mano — la deviazione dal precedente del mappamondo, e perché.
5. **La tessera aperta è bianca e tiene lo schermo acceso**: la luminosità non si può, e questo è il sostituto — con il fatto verificato, perché nessuno lo ricerchi di nuovo.
6. **La scansione non usa `BarcodeDetector`** — scritto oggi anche se il codice arriva dopo, perché il fatto è di oggi.
7. **L'app funziona offline** con un service worker e la copia locale dei file cifrati — ADR del blocco 4, con le conseguenze sull'aggiornamento.

## Assunzioni prese senza chiedere

Scelte di routine, da correggere in fase di piano se non tornano:

- Ordinamento alfabetico di partenza e «usate di recente» come segno del dispositivo, non dei dati.
- La tessera aperta è una rotta (`/carte/:id`), «Dettagli» è un foglio.
- La campanella mostra righe generiche per le carte, senza nome.
- Le immagini sono JPEG ovunque (Safari non garantisce la codifica WebP dal canvas), 320 px di lato lungo.
- I formati della prima versione sono quelli di `jsbarcode` più `'text'`; `'qr'` esiste nel tipo e si accende solo se serve.
- Il gruppo dell'hub si chiama «Al negozio» e per ora ha una voce sola.
