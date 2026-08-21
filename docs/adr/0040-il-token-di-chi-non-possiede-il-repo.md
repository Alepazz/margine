# ADR-0040: Chi non possiede il repo scrive con un token classic e `public_repo`

**Status:** accepted · **Date:** 2026-08-21

## Context

Federica, seguendo le istruzioni scritte in tre posti — l'etichetta in Impostazioni, il README e l'ADR-0005 — non trovava `Alepazz/margine` nell'elenco dei repository durante la creazione del token. Non era un suo errore né una svista: **è una limitazione documentata di GitHub**.

Un token fine-grained ha **un solo** *resource owner*, e i soli owner selezionabili sono sé stessi e le organizzazioni di cui si è membri. Il repo appartiene all'account personale di Alessio, che lei non può selezionare — quindi nel menù non compare niente da spuntare. La documentazione GitHub elenca «contribuire a repository dove si è collaboratore» fra i limiti noti dei fine-grained, e dice il verso positivo a chiare lettere: solo i token **classic** hanno accesso in scrittura ai repository pubblici che non sono tuoi. Per un repo pubblico un fine-grained offre soltanto *Public repositories (read-only)*, che è esplicitamente in lettura.

Le due alternative sono state scartate per il loro prezzo, non per gusto:

- **Trasferire il repo a un'organizzazione** (gratuita) renderebbe il fine-grained possibile, perché l'organizzazione diventerebbe un owner selezionabile per entrambi. Ma il sito è pubblicato su `alepazz.github.io/margine`, e quell'indirizzo è già sulla schermata Home di due telefoni: cambiarlo per una questione di token è la coda che scodinzola il cane.
- **Il token di Alessio sul telefono di lei** funzionerebbe subito, ed è esattamente quello che l'ADR-0039 ha rifiutato: senza il suo account, i commit non dicono più chi ha scritto cosa, che è l'unica garanzia rimasta sulla scrittura.

## Decision

Chi **possiede** il repo usa un token fine-grained limitato a questo repo con `Contents: read and write`. Chi vi accede **come collaboratore** usa un token **classic** con la sola spunta `public_repo`, scadenza un anno.

Le istruzioni devono dire entrambi i casi nei tre posti dove vivono — l'etichetta del campo in `Impostazioni.tsx`, il README, questo ADR — e il messaggio del 403 in `github.ts` non può più nominare solo «Contents: read and write», che per un token classic non è un permesso esistente.

Questo ADR non sostituisce l'ADR-0005, che resta `accepted`: la sua decisione — scrivere via API GitHub, token in `localStorage`, per dispositivo e mai nel repo — vale tutta. Qualifica solo la frase sul **tipo** di token, che era scritta quando l'unica persona con accesso era il proprietario del repo.

## Consequences

Due tipi di token per la stessa app, e un'istruzione che si biforca: è il costo diretto della limitazione, e non c'è modo di pagarlo una volta sola finché il repo appartiene a un account personale.

`public_repo` è **più larga** del fine-grained che avremmo voluto, e va detto con precisione: dà scrittura su tutti i repository pubblici su cui lei ha diritto di push — oggi solo questo — e su nessun repository privato. La differenza rispetto all'ADR-0039 è che il perimetro cresce con la sua vita su GitHub anziché col progetto: se fra un anno collaborerà a un altro repo pubblico, questo token potrà scrivere anche là. Resta vero, e conta più del perimetro, che leggere il compartimento personale dell'altro non è questione di token ma di chiavi.

Il rischio da presidiare è **la modernizzazione bene intenzionata**: GitHub raccomanda i fine-grained e sconsiglia i classic, quindi fra sei mesi la riga «token classic» sembrerà una svista da correggere. Correggerla toglierebbe a Federica l'accesso, e il sintomo tornerebbe identico — un elenco di repository vuoto, che non somiglia a un permesso sbagliato. Per questo la ragione sta qui e non solo in un commento.

Due scadenze, entrambe silenziose: GitHub cancella i token non usati per un anno (per lei non è un problema, l'app scrive ogni mese), e se un giorno i classic venissero davvero dismessi la strada resta l'organizzazione — con l'indirizzo nuovo del sito, e un ADR nuovo che decida se vale la pena.
