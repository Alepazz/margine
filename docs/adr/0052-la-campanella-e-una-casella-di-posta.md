# ADR-0052: La campanella è una casella di posta, non un registro

**Status:** accepted · **Date:** 2026-08-26 · Supera due scelte di presentazione di ADR-0051

## Context

ADR-0051 ha deciso *dove* prendere le novità — dai commit — e quella parte regge. Ha deciso anche *come mostrarle*, e all'uso quelle due scelte si sono rivelate sbagliate. Alessio, provandola in produzione: «vedo 1 spesa aggiunta, 1 tricount modificato, ecc. e poi dopo un po' i commit vengono sciolti e si legge il contenuto. Non mi piace».

Aveva ragione su due cose distinte.

**La riga era il salvataggio, non la cosa.** «1 spesa aggiunta» è il messaggio di commit, cioè un fatto tecnico su come l'app scrive nel repo. Chi apre una campanella vuole leggere «Federica ha aggiunto Aperitivo, 11 €»: il numero di operazioni in un commit non è un'informazione, è un dettaglio d'implementazione promosso a titolo. E siccome il contenuto arriva un momento dopo, il titolo generico restava lì a farsi leggere per poi cambiare sotto gli occhi — due letture per una notizia.

**Aprire dichiarava letto.** Sembrava comodo e toglieva il controllo: la campanella si svuotava mentre la si guardava, e alla riapertura successiva non si sapeva più cosa fosse già stato visto e cosa no. Alessio: «devo avere un bottone svuota notifiche, così prossima volta che vedo il numero so che dentro ci sono solo quelle che non ho ancora visto».

## Decision

**La campanella contiene solo ciò che non è stato svuotato**, e a svuotarla è un pulsante nel piede del foglio. Aprire non dichiara niente: leggere e archiviare sono due gesti, e confonderli fa sparire una notifica mentre la si guarda. Il piede — non il fondo dell'elenco — perché non scorre, e con venti notifiche dentro un pulsante in coda non si raggiunge.

**Una riga per cosa, non per salvataggio.** Tre spese salvate insieme sono un commit solo e tre righe, ognuna con titolo, importo, categoria e tricount.

**Il numero sul pallino è la lunghezza dell'elenco**, non una stima ricavata dal messaggio. La differenza non è cosmetica: il conteggio dal messaggio prometteva cose che l'elenco non mostrava — una spesa finita nel compartimento personale dell'altra persona conta nel messaggio e non può diventare una riga con un titolo. Misurato sui commit veri prima della correzione: pallino 23, righe 21.

La conseguenza è che le righe si compongono in **un posto solo** (`noticesOf`, nel dominio, testata) e il conteggio è `notices.length`. Elenco e numero prodotti in due punti diversi prima o poi divergono, e a mentire sarebbe il pallino.

La seconda conseguenza è che il contenuto va letto **prima** che la campanella si apra: le righe di una spesa esistono solo se il dettaglio è arrivato, quindi aspettare l'apertura vorrebbe dire mostrare un numero sbagliato fino a quel momento. Il caricamento anticipato sta nello store, con un tetto di cinque; oltre, le righe restano generiche e contano una per operazione — un'approssimazione dichiarata che si presenta solo dopo una lunga assenza.

**Ciò che il filtro nasconde non lascia traccia**: né una riga, né un numero. La prima versione ne mostrava una che diceva «e 2 fuori dai tuoi tricount», per il principio che il fatto non è segreto e solo il contenuto lo è. Alessio l'ha respinta vedendola: «non ci deve essere traccia di notifica per operazioni che non riguardano l'altro». Una notifica per qualcosa su cui non puoi fare niente è rumore, e sapere *che* è successo qualcosa nel compartimento personale dell'altra persona è già più di quanto serva. Qui la separazione è più forte che altrove nell'app. → ADR-0039

Il prezzo, dichiarato: finché il dettaglio non è arrivato non si può sapere che un salvataggio era tutto personale, quindi la riga generica compare e poi sparisce. La finestra è quella di una richiesta, e il caricamento parte da solo appena la lista dei commit atterra — ma esiste, e non si può chiudere senza scrivere nel repo pubblico ciò che quel commit conteneva.

Finché il contenuto non è arrivato la riga porta la frase generica ricavata dal messaggio — «Federica ha aggiunto una spesa» — in grigio. È tutto ciò che si sa davvero in quel momento, ed è già una frase invece di un'etichetta da decifrare.

Questo richiede una **seconda coniugazione** dello stesso vocabolario: `PHRASES` accanto a `OP_WORDS`. Non è una duplicazione ma una traduzione fra due registri — «spesa aggiunta» va bene in un messaggio di commit e male in una notifica — e il test di parità copre anche questa tabella.

Respinto: mostrare il commit come titolo con le spese annidate sotto. Era la forma di prima, ed è quella che ha fatto dire «non mi piace»: annidare vuol dire che la cosa che interessa sta al secondo livello.

Respinto: conservare lo storico dopo lo svuotamento. Sarebbe stata la scelta prudente — si può sempre tornare a guardare — ma rende falsa la promessa del numero: «dentro ci sono solo quelle che non ho ancora visto». Lo storico completo sta in `git log`, che è il posto dove vive davvero.

## Consequences

Il pallino ora promette una cosa vera: quel numero è esattamente quanto c'è dentro. Ed è il motivo per cui svuotare è distruttivo — ciò che è stato svuotato non si rilegge dall'app.

Il messaggio di commit resta un'interfaccia (→ ADR-0051) e adesso lo è **due volte**: per riconoscere l'operazione e per scriverne la frase. Chi aggiunge un tipo a `Op` deve dargli una parola in `OP_WORDS` e una frase in `PHRASES`; il tipo lo impone a compilazione e il test lo dice a chi legge.

Restano in piedi di ADR-0051: leggere dai commit, il dettaglio decifrato in locale e mai scritto nel messaggio, la separazione dei compartimenti, il caricamento automatico delle prime cinque, la cache. Cade solo la presentazione.

Una conseguenza da non perdere: **le righe di una spesa esistono solo se il dettaglio si è potuto leggere.** Senza (nessuna passphrase, rete assente, commit troppo vecchio) resta la frase generica — vera, solo più vaga. Perché non degradi in silenzio, una riga fallita lo **dichiara** e si riprova toccandola: il caricamento automatico salta ciò che ha già uno stato, quindi senza quel tocco una rete caduta per un istante lascerebbe la riga vaga per tutta la sessione.
