# ADR-0094: Una correzione che non muove la cifra non è una novità

**Status:** accepted · **Date:** 2026-09-03 · Restringe una regola di presentazione di ADR-0052

## Context

Sui dati veri la campanella mostrava righe come «Alessio ha corretto Assicurazione · categoria»: una spesa aperta, un campo ritoccato, una notifica. Alessio, il 03/09/2026: «Assicurazione e simili non serve averli come notifica, a meno che non cambi la cifra spesa».

Il difetto non è il numero di righe — nella storia vera le correzioni sono sei e le annotazioni quattro, non venti. È che quelle righe **non hanno un contenuto**: una notifica che dice «qualcosa è cambiato, ma non i soldi» costa attenzione e non ne restituisce, e la campanella si legge finché ciò che ci sta dentro merita di essere letto. Il rumore non si misura in righe al giorno, si misura in righe che non servivano.

Il vincolo che decide la forma della soluzione: **quali campi si sono mossi si sa solo dal confronto**, non dal messaggio di commit. Il messaggio dice «1 spesa corretta» e deve continuare a dirlo, perché il repo è pubblico (→ ADR-0051). Quindi il filtro può stare solo dopo che il dettaglio è arrivato — tranne dove si può **dedurre** dal messaggio, che è il caso delle annotazioni.

## Decision

Una modifica fa una riga solo se ha toccato uno dei tre campi che spostano denaro **fra le due persone**: `amount`, `shares`, `paidBy`. La regola è `movesMoney()` in `src/domain/diff.ts`, applicata da `noticesOf`; una spesa comparsa o sparita ne sposta sempre, quindi il filtro riguarda le sole modifiche.

Il verdetto per campo sta in `MONEY_FIELDS`, un record **totale** su `Expense`: un campo nuovo non compila finché non gli si è dato un `true` o un `false`. Un insieme lo avrebbe dato per «non è denaro» in silenzio, e fra i due modi di sbagliare quello silenzioso è il peggiore — un importo che si muove senza che nessuno lo veda.

Scartate due alternative, entrambe proposte ad Alessio con le loro conseguenze:

- **Solo `amount`.** Una divisione girata da «metà» a «tutta tua» lascia la cifra ferma e sposta nel saldo metà della spesa: sarebbe stato un silenzio su del denaro vero.
- **Anche `date`, `tricount`, `recurring`, `offBudget`** — tutto ciò che muove un numero da qualche parte. Muovono il mese, il secchio, il saldo; non muovono quanto è stato speso né chi lo deve a chi. E sono **esattamente** le correzioni che si fanno di continuo: un refuso di data, una spunta ricorrente dimenticata. Le tre correzioni ancora da fare sui dati veri sono due spunte ricorrenti e una data, cioè tre notifiche che con questa scelta non arrivano.

Da qui una deduzione che non è una seconda decisione: **un'annotazione non può mai fare una riga**. `applyPatch` tocca `notes`, `receiptLinks`, `tax730` e `welfare`, e tutti e quattro sono `false` in `MONEY_FIELDS`. Quindi `patch` entra in `SILENT_KINDS`, dove il silenzio si legge **dal messaggio** e costa zero: niente confronto da scaricare, e niente riga generica che compare e poi sparisce. Per la stessa ragione `touchesExpenses` scarta le operazioni mute, così un commit di sole annotazioni non tira giù due file da 367 kB (→ ADR-0087).

## Consequences

Un commit di sole correzioni innocue produce **zero righe**: esiste in `git log` e la campanella resta spenta. È coerente con ADR-0052 — la casella di posta non è il registro — ma va saputo, perché rende la campanella un indice incompleto della storia per costruzione.

Il prezzo dichiarato: finché il confronto non è arrivato non si può sapere se la cifra si è mossa, quindi **la riga generica compare e poi sparisce**. È la stessa finestra che ADR-0052 accetta per le spese fuori dai propri tricount, e dura una richiesta. La conseguenza pratica è che il pallino può accendersi e spegnersi da sé su una correzione di categoria.

E il costo che resta: una correzione va scaricata comunque per sapere che non serviva. Sono 734 kB per una riga che non compare, e non c'è modo di evitarlo senza mettere nel messaggio pubblico ciò che il messaggio non deve dire.

Una conseguenza di forma che vale la pena registrare: «quali campi si sono mossi» ora si risponde in un posto solo (`movedKeys`), perché a farsi la domanda sono due — chi scrive le etichette della riga e chi cerca il denaro. Con due cicli separati basterebbe che uno dei due trattasse un campo diversamente perché una riga dicesse «modificata: importo» senza che l'importo conti come denaro.

Il presidio è in `diff.test.ts`: oltre alla totalità di `MONEY_FIELDS`, un test tiene insieme i **quattro campi di un'annotazione** e il verdetto «non è denaro». Se uno dei quattro diventasse denaro, il silenzio gratuito di `patch` comincerebbe a nascondere qualcosa — e quel test è il posto dove ce se ne accorge.
