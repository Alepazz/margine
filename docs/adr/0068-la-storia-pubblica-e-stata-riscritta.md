# ADR-0068: La storia pubblica è stata riscritta

**Status:** accepted · **Date:** 2026-08-28

## Context

ADR-0067 stabilisce che le cifre vere non stanno nei file tracciati, e le ha tolte da `HEAD`. Resta il passato: cinquantasette commit già pubblicati su un repo pubblico, dove le stesse cifre si trovano con un `git log -S`, o semplicemente aprendo una versione vecchia di `CLAUDE.md` su GitHub.

Toglierle solo dallo stato corrente non è inutile — la ricerca codice di GitHub indicizza `HEAD`, ed è così che qualcosa si trova per caso invece che cercandolo — ma lascia intatto il recupero deliberato. Su un dato che non è solo di Alessio, «bisogna volerlo» non è una protezione sufficiente.

Il vincolo che rende la decisione non ovvia è che una riscrittura tocca **tutto**, compresi i due file cifrati. `git filter-repo --replace-text` sostituisce stringhe letterali in ogni blob della storia: se una delle stringhe da sostituire compare per caso dentro il base64 di `expenses.json.enc`, quel file esce corrotto e i dati sono irrecuperabili. Non è un rischio teorico: la sigla di due cifre e una lettera con cui una RAL si abbrevia — quella che stava in `CLAUDE.md` — **compare davvero** dentro `expenses.json.enc`, per puro caso, in mezzo al base64.

## Decision

La storia è stata riscritta con `git filter-repo --replace-text` e il branch ripubblicato con un force push.

Le alternative. **Lasciare il passato**: costa niente e lascia il dato di Federica recuperabile per sempre. **Rendere privato il repo**: elimina il problema alla radice e con esso GitHub Pages, cioè l'architettura (→ ADR-0002). **Riscrivere**: costa una rottura una volta sola, e la rottura qui è piccola perché nessuno dei due ha un clone locale del repo — i commit «(da Margine)» nascono via API dal browser, quindi non c'è nessuna copia di lavoro da riallineare e la coda in `localStorage` non ne soffre.

Le regole di sostituzione stanno in `docs/private/riscrittura-espressioni-2026-08-28.txt`, ignorato. **Ogni stringa contiene uno spazio, un `€`, una parentesi o una virgoletta**, cioè caratteri che non esistono nell'alfabeto base64 né in un hash: è questo, e non l'attenzione di chi scrive la lista, a rendere impossibile che una regola tocchi un file cifrato. Per le due sigle delle RAL, che sono sole cifre e lettere, si usano forme più lunghe che includono la parentesi o gli spazi intorno. Prima di eseguire, la lista è stata provata contro **tutti i 109 blob storici** di `expenses.json.enc`, `config.json.enc`, `package-lock.json` e `package.json`: zero collisioni.

## Consequences

**Ogni sha è cambiato**, compresi quelli dei commit scritti dall'app a nome di Federica. Chi avesse un clone fatto prima di oggi lo deve rifare; per come è usato questo repo, nessuno ce l'ha.

**I dati cifrati sono intatti, e lo si è verificato invece di darlo per buono.** Le impronte SHA-256 dei trentanove blob cifrati storici sono state prese prima della riscrittura (`docs/private/enc-prima.txt`) e riconfrontate dopo. È il controllo che distingue «non dovrebbe essere cambiato niente» da «non è cambiato niente».

**Il backup esiste e la strada di ritorno è scritta.** `../margine-backup-pre-riscrittura-2026-08-28.bundle`, verificato con `git bundle verify`, con le istruzioni di ripristino in `docs/private/riscrittura-storia-2026-08-28.md`. Un force push senza una via di ritorno provata non è una decisione, è una scommessa.

**Resta un residuo, dichiarato.** I numeri tondi senza `€` attaccato — `1903`, `300`, `2286` — sono sole cifre, quindi ricadono nel caso di `40K` e non si possono sostituire in sicurezza. Le tre righe di calcolo di ADR-0016 sono state prese come letterali interi, quindi quelle escono; qualche numero tondo isolato può essere sopravvissuto in una versione vecchia. Da soli non identificano un reddito, e il costo di inseguirli era corrompere i file cifrati.

**Una cosa non si toglie da qui.** L'indirizzo di posta personale di Federica è nei metadati d'autore dei commit, e la riscrittura non lo cambia. Lo toglie lei, attivando «Keep my email addresses private» su GitHub: da quel momento i commit dall'app useranno il suo indirizzo `noreply`. Quelli già fatti restano.

**Il deploy è ripartito da zero**, perché il workflow gira su push e la storia è nuova. L'app non se ne accorge: i file cifrati sono gli stessi byte, quindi la passphrase apre come prima.
