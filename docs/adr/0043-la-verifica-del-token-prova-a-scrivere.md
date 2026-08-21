# ADR-0043: La verifica del token prova a scrivere, non a leggere

**Status:** accepted · **Date:** 2026-08-21

## Context

Federica ha registrato dei prezzi sul suo telefono e Alessio non li vedeva. La diagnosi: **nessun commit suo nel repo**, e il file cifrato online identico byte per byte a quello dell'ultimo push. Le sue rilevazioni non erano perse — erano nella coda del suo browser — ma non erano mai partite.

La causa a monte è il token, creato prima che le istruzioni fossero corrette (→ ADR-0040): un fine-grained, che su un repo di un altro account non può scrivere. La causa che ha reso il problema **invisibile per un giorno** però è un'altra, ed è nostra: il pulsante di verifica in Impostazioni chiamava `getFile()` e, riuscendo, rispondeva «accesso in lettura confermato». Su un repo **pubblico** quella lettura non prova niente:

```
$ curl -s -o /dev/null -w "%{http_code}" \
    https://api.github.com/repos/Alepazz/margine/contents/public/data/expenses.json.enc
200
```

Duecento **senza alcun header di autorizzazione**. Il controllo passava con un token in sola lettura, con un token scaduto e con una stringa inventata. Chi lo vedeva verde credeva di aver finito, e ogni salvataggio successivo restava in coda con un errore che nessuno andava a leggere.

Le alternative valutate:

- **`GET /repos/{owner}/{repo}` e guardare `permissions.push`.** Richiede autenticazione (senza token il campo non c'è nemmeno), ma quel campo descrive il **ruolo della persona** sul repo, e per i token fine-grained non riflette in modo garantito gli scope del token. Direbbe `push: true` a una collaboratrice con un token in sola lettura: lo stesso falso verde di prima.
- **Fare un commit vero e poi annullarlo.** Prova esattamente la cosa giusta, ma sporca la storia del repo con una voce per ogni tocco del pulsante — e se l'annullamento fallisce lascia il repo diverso da come l'ha trovato.

## Decision

La verifica **crea un blob** (`POST /git/blobs`), che è il primo passo del commit vero in `commitFiles`, richiede lo stesso permesso, e produce un oggetto che nessun commit referenzia: nessun file, nessuna voce nella storia, niente da annullare. Git raccoglie gli oggetti non raggiungibili da sé.

Due proprietà lo rendono innocuo, e vale la pena averle scritte perché sono la ragione per cui la scelta non è sporca:

- **È idempotente per costruzione.** Gli oggetti git sono indirizzati dal contenuto: il blob di verifica ha sempre lo stesso testo, quindi sempre lo stesso sha. Premere il pulsante mille volte crea un oggetto, non mille (verificato: due chiamate, `4cd4b72a…` entrambe).
- **Non è raggiungibile da nessun ref**, quindi non compare in `git log`, in nessun albero, in nessun diff, e non tocca i file serviti da Pages.

Il `404` si tratta come il `403`, con un accorgimento: quando un token non ha il permesso di scrivere GitHub risponde `404` per non rivelare cosa esiste, ma `404` è **anche** la risposta a un repo che non esiste — `owner` o `repo` sbagliati nella configurazione — e i due casi portano a rimedi opposti. Si distinguono con una lettura: se il file si legge, il repo c'è e il problema è il permesso. Solo allora il messaggio parla di token, e dice quale serve distinguendo «il repo è tuo» da «ci accedi come collaboratore».

La lettura resta come **secondo** controllo, dopo la scrittura: prende un caso che il blob non vede — `dataPath` o `branch` sbagliati nella configurazione.

## Consequences

Il pulsante ora dice la verità, e cambia nome: «Verifica la scrittura», non «Verifica accesso». Un token in sola lettura viene respinto **quando lo si incolla**, che è il momento in cui c'è ancora qualcuno davanti allo schermo disposto a rimediare — invece di un errore in sottofondo, giorni dopo, dentro una coda.

Il costo è un oggetto non referenziato per repo. Chi lo trovasse frugando negli oggetti sciolti potrebbe chiedersi cosa sia: c'è scritto `margine: verifica accesso`.

Il rischio da presidiare è la semplificazione bene intenzionata. Fra sei mesi quella `POST` sembrerà un modo strano di controllare un token, e «basta leggere il file» sembrerà più pulito. Rimetterebbe in piedi esattamente questo difetto — un verde che non vuol dire niente — e il sintomo tornerebbe a manifestarsi altrove e più tardi: non nel controllo, ma in un dato che non arriva sul telefono dell'altra persona.

Un secondo posto in cui il verde non voleva dire niente, trovato il giorno dopo perché il token di Federica risultava «never used» su GitHub mentre lei aveva letto un messaggio di successo: il pulsante **Salva token** mostrava «Token salvato su questo dispositivo» in ogni caso, e la sincronizzazione che chiamava subito dopo **non fa nessuna richiesta se la coda è vuota**. Zero richieste, zero utilizzi del token, e un messaggio che sembrava una conferma. Ora salvare **verifica**: il pulsante si chiama «Salva e verifica», e il messaggio dice quale delle due cose è andata. La lezione è la stessa di sopra, e va scritta perché si è ripetuta a due giorni di distanza in due punti diversi: **un messaggio di successo deve essere la conseguenza di un'operazione riuscita, non del fatto che si è premuto un pulsante.**

Nello stesso giro è stato chiuso un percorso muto in `flush()`: senza passphrase in memoria usciva con un `return` senza stato e senza messaggio, quindi il contatore delle modifiche in attesa restava fermo senza dire perché. Ora dichiara che i dati sono bloccati.

Una cosa che questo ADR **non** risolve: le modifiche già in coda su un dispositivo col token sbagliato restano in coda finché il token non funziona. Vivono in `localStorage`, quindi svuotare i dati del sito per qualunque altra ragione le cancella. L'ordine giusto quando si ripara un token è: prima il token, poi tutto il resto.
