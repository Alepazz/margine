# ADR-0053: Una campanella vuota dice perché

**Status:** accepted · **Date:** 2026-08-27

## Context

Il 27 agosto 2026, verificando sul banco che il caricamento delle novità partisse all'apertura dell'app, la campanella era vuota e il pallino assente. Ho cercato per dieci minuti una regressione nel codice scritto il giorno prima. Non c'era: a forza di ricaricare avevo esaurito le **60 richieste all'ora** che GitHub concede a un indirizzo IP senza token, e ogni chiamata tornava `403` con `x-ratelimit-remaining: 0`.

Due difetti, indipendenti, tenevano nascosta la causa.

Il `catch` di `loadNews` era muto **per scelta dichiarata** — «senza rete la campanella resta con ciò che aveva: non è un errore da dire». Il ragionamento sembrava giusto e non lo era: una lettura fallita e un periodo senza novità producono lo stesso identico schermo, e le due cose non si equivalgono affatto. Una campanella vuota perché non è successo niente è rassicurante; una campanella vuota perché la lettura è fallita è una promessa rotta in silenzio. Sono già le rilevazioni di Federica rimaste un giorno in coda senza che nessuno lo sapesse (→ ADR-0043), un piano più in là.

E il messaggio del `403`, dove lo si vedeva, mandava nel posto sbagliato: «Permesso negato dal token: serve *Contents: read and write* se è fine-grained, *public_repo* se è classic» — cioè a controllare le spunte di un token che, su un repo pubblico letto in sola lettura, potrebbe non esistere nemmeno. È lo stesso inganno che ADR-0043 documenta per il `404` sulle scritture: una risposta HTTP che vale due cose diverse, e un messaggio che ne nomina una sola.

## Decision

**Ogni percorso che finisce senza mostrare niente dichiara perché.** `loadNews` non ingoia più l'eccezione: la traduce con `describeError` e la mette in `NewsState.error`, che il foglio rende. Ogni percorso che invece riesce azzera quel campo, perché un guasto vecchio a schermo è a sua volta una bugia.

**La dichiarazione sta sopra l'elenco, non al posto suo.** La prima versione rendeva l'errore come primo ramo di un ternario, quindi sostituiva l'elenco: misurato sul banco bloccando `fetch` verso `api.github.com` e rientrando in primo piano, il pallino diceva **«4 da vedere»** e il foglio mostrava **zero righe**. Le novità erano ancora in memoria — una lettura fallita non tocca `changes` — ma erano diventate irraggiungibili, ed era di nuovo la divergenza fra pallino ed elenco che ADR-0052 aveva appena tolto. L'errore è un'intestazione; l'elenco resta quello che c'era.

**Il `403` si legge dall'intestazione, non dal corpo.** In `failure()`, prima dello `switch` sugli stati, `x-ratelimit-remaining === '0'` distingue il limite esaurito dal permesso mancante, e `x-ratelimit-reset` dice fra quanti minuti riprovare. Il confronto è con la stringa e non con `Number(...)`: un'intestazione assente torna `null`, e `Number(null)` è `0`, che farebbe passare per limite esaurito proprio il permesso negato. Il corpo JSON di GitHub non si guarda — è prosa inglese, non contratto.

Il messaggio nomina tutti e due i regimi invece di dare per scontato che un token non ci sia: «Senza token il limite è 60 all'ora, con un token in Impostazioni sale a 5000». Presumere la causa è l'errore che questo ADR corregge, e ripeterlo nella frase che lo corregge sarebbe grottesco.

## Consequences

Il difetto non si ripresenta muto: un limite esaurito, una rete caduta, un token scaduto ora si leggono nel foglio invece di somigliare a un periodo tranquillo. In produzione il limite non si tocca — con un token sono 5000 richieste all'ora — ma un dispositivo senza token ci arriva, e due telefoni sulla stessa rete condividono le stesse 60.

Il ramo del limite **non ha test**, perché `failure()` non è esportata. È una funzione pura di una `Response`, quindi sarebbe testabile senza rete: esportarla è il lavoro che resta. Le due verifiche fatte sono misure a mano nel browser, e vanno rifatte a mano se quella parte cambia.

Il prezzo accettato: il testo dell'errore nasce in `src/data/github.ts` e finisce a schermo passando per `src/data/store.tsx`, senza che nessuno dei tre file nomini gli altri per questa ragione. Chi cambia una frase in `failure()` cambia cosa legge una persona in un file che non la contiene.
