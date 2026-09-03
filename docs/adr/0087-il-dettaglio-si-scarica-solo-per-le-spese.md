# ADR-0087: Il dettaglio di una novità si scarica solo se il commit tocca le spese

**Status:** accepted · **Date:** 2026-09-03

## Context

La campanella mostra *quale* spesa è comparsa, con titolo e importo, decifrando in locale il file delle spese a quel commit e a quello prima: nel messaggio di commit quel dettaglio non ci può stare, perché il repo è pubblico e ciò che finisce in `git log` è in chiaro per chiunque, per sempre (→ ADR-0051). Sono **due file da 367 kB** per novità (misurati il 03/09/2026), e fino a cinque novità si caricano da sole all'apertura dell'app — cosa che deve avvenire, perché il numero sul pallino conta le righe e le righe nascono dal dettaglio (→ ADR-0052).

Il difetto: `loadDetail` non guardava **cosa** il commit avesse toccato. Per un commit di soli prezzi, carte, tricount o configurazione, il confronto fra le due versioni del file delle spese è vuoto **per costruzione** — non perché non sia successo niente, ma perché quel file non è stato scritto. Tre quarti di megabyte scaricati e decifrati per ottenere una lista vuota, e un morso alle sessanta richieste all'ora che GitHub concede senza token: è già capitato di esaurirle e di cercare per dieci minuti una regressione che non c'era, perché l'app non aveva modo di dire «è il limite» (→ ADR-0053).

Finché l'app scriveva tre commit al giorno il costo era quasi teorico. La lista della spesa lo cambia: ogni cosa presa è un commit, quindi una spesa di venti voci sono venti novità. Il conto vero, fatto con i tetti che esistono — cinque novità per volta (`MAX_AUTO_DETAIL`) e una cache di tre versioni per riferimento, che fa condividere il file a due novità consecutive — è **sei file per il caricamento automatico, cioè 2,2 MB**, e circa **7,7 MB** se durante il giro tutte e venti finiscono per essere lette, cinque alla volta a ogni rilettura della lista. Non quindici, come avevo scritto prima di misurare: i due tetti pagano. Restano megabyte scaricati per non dire nulla, e una richiesta all'API per ogni file.

## Decision

`touchesExpenses(change)` in `src/domain/changes.ts`: vero se fra le parti del messaggio ce n'è almeno una in `EXPENSE_KINDS`. `loadDetail` esce subito quando è falso, e il ciclo automatico **filtra prima di prendere i primi cinque**.

Tre dettagli che sono la decisione, non l'implementazione:

- **Si risponde dal messaggio, senza rete.** È ciò che rende la guardia gratuita: `describeOps` scrive «2 prezzi rilevati» e `partsOfSummary` lo rilegge, quindi si sa cosa contiene un commit prima di scaricare qualunque cosa. Chiedere all'API quali file ha toccato un commit sarebbe stata una richiesta in più per risparmiarne due.
- **Uscire non è fallire.** Non si scrive nessuno stato nella cache: un commit senza spese non produce righe di spesa in `noticesOf`, quindi non c'è nessuna riga che resti in attesa di un dettaglio, e la riga generica dell'operazione (che il messaggio descrive già per intero) è quella giusta. Scrivere `failed` avrebbe reso toccabile una riga che al tocco non avrebbe fatto niente.
- **Il filtro sta prima dello `slice`.** Contando anche i commit senza spese, cinque novità di lista consumerebbero tutto il budget del caricamento automatico e il dettaglio della spesa vera non partirebbe — cioè lo stesso silenzio, per un'altra strada.

Il caso che impedisce di scrivere la guardia al contrario («il commit è tutto di lista?»): un salvataggio può portare una spesa **e** una cosa presa, e allora il dettaglio serve. La domanda giusta è se ci sia almeno una spesa, non se ci sia solo altro. E un messaggio che non si riconosce affatto non ha parti, quindi non ha spese: il ripiego è «non scaricare», che è giusto — un commit scritto a mano che finisse per caso col suffisso non deve costare una decifratura.

## Consequences

Le novità che non riguardano le spese non costano più niente: nessuna richiesta, nessuna decifratura, nessun consumo del limite. Le altre si comportano esattamente come prima.

Il prezzo è un accoppiamento in più fra il vocabolario dei messaggi e il costo di rete: se un giorno un'operazione nuova sulle spese non finisse in `EXPENSE_KINDS`, il suo dettaglio non si scaricherebbe **in silenzio** — la riga generica comparirebbe e nessuno la vedrebbe come un difetto. `EXPENSE_KINDS` è già la lista da cui `noticesOf` decide chi ha un dettaglio, quindi le due cose sbagliano insieme o niente; ma è la ragione per cui la guardia sta nel dominio, con i suoi test, e non in una riga dentro lo store.
