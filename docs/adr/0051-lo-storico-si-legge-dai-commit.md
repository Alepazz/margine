# ADR-0051: Lo storico delle novità si legge dai commit, non da un campo nei dati

**Status:** accepted · **Date:** 2026-08-26

## Context

Con due persone che scrivono sullo stesso file cifrato, «cosa ha cambiato l'altra da quando non guardavo» non aveva risposta: l'app scaricava i dati una volta al boot e non li rileggeva mai più — nessun polling, nessun `visibilitychange` — quindi una spesa aggiunta dall'altro telefono restava invisibile fino a un ricaricamento vero.

Per dire chi-cosa-quando servono tre informazioni che il `Dataset` non porta. La strada ovvia sarebbe aggiungerle: un autore e un istante su ogni spesa, o una lista di eventi nel file. Vorrebbe una migrazione, gonfierebbe un file che viene riscritto per intero a ogni salvataggio, e non direbbe niente su ciò che è già successo.

Ma quelle tre informazioni **esistono già**, complete e retroattive: ogni scrittura dell'app è un commit il cui messaggio lo genera `describeOps` e il cui autore è chi ha usato il proprio token. Il repo è pubblico, quindi l'elenco si legge senza credenziali.

Il vincolo che chiude il ragionamento: il sito è statico e non c'è backend. Le notifiche vere a schermo bloccato vorrebbero un service worker, chiavi VAPID, un file con le sottoscrizioni dei dispositivi e qualcuno che invii — su un repo pubblico, con le sottoscrizioni da cifrare e la passphrase come secret di un'Action. È fattibile, ed è un'altra decisione.

## Decision

Le novità si ricavano dai **commit**, letti con `GET /repos/{owner}/{repo}/commits` in una pagina sola: a tre commit al giorno cento coprono mesi. Il token è facoltativo perché il repo è pubblico; quando c'è, si impara anche il proprio login (`GET /user`, una volta, in `localStorage`) per non contarsi da soli fra le novità.

Tre filtri: solo i commit che finiscono con `(da Margine)` — cioè quelli scritti dall'interfaccia, non i commit di codice né la sessione di import; solo quelli di qualcun altro; solo i gruppi accesi in Impostazioni. Il tutto in `src/domain/changes.ts`, che non va in rete ed è testato.

La traduzione dal messaggio al gruppo **non riscrive il vocabolario**: `OP_WORDS` è esportato da `outbox.ts` e la mappa inversa si costruisce da lì, con un test di parità sui tredici tipi. Due copie divergerebbero in silenzio — una riga senza gruppo, che nessuna spunta può accendere o spegnere.

**Il dettaglio — quale spesa, quanto, in che tricount — non entra nel messaggio di commit.** Il repo è pubblico: `git log` lo legge chiunque, senza passphrase, per sempre. Scrivere «Spesa Coop · 34,36 € · Spese condivise» in un messaggio pubblicherebbe in chiaro esattamente ciò che `expenses.json.enc` esiste per proteggere, e la regola del progetto è che i dati in chiaro non entrano nel repo — un messaggio di commit **è** il repo. Il messaggio resta quello che è: conteggi e verbi.

Il dettaglio si ricava **decifrando in locale**: si scarica il file cifrato a quel commit e a quello prima (`?ref=<sha>`, col primo genitore che arriva già nella stessa risposta dell'elenco), si decifrano e si confrontano (`domain/diff.ts`). Due file da 359 KB, quindi **a richiesta** e con la cache: un commit passato non cambia, e ciò che è stato calcolato una volta resta.

Un caso è però gratuito e vale la pena averlo: se dall'ultima rilettura è arrivato **un commit solo**, il confronto fra il remoto di prima e quello di adesso — che la rilettura ha già fatto — *è* il dettaglio di quel commit, e si mette in cache senza scaricare niente. Se ne sono arrivati più d'uno l'attribuzione sarebbe indovinata, e allora si butta: il conteggio guarda **tutti** gli sha, non solo quelli visibili, perché un commit mio e uno suo insieme darebbero «uno nuovo» e attribuirgli il confronto direbbe il falso.

Il dettaglio rispetta la separazione dei compartimenti: si vedono solo le spese dei tricount di cui chi guarda è membro. Ciò che resta fuori **non sparisce** — la riga continua a dire «1 spesa aggiunta» — perché il fatto che qualcosa sia successo non è segreto, è il contenuto a non essere affare di chi guarda. Una convenzione che vale ovunque tranne che nella campanella non varrebbe da nessuna parte. → ADR-0039

Una novità è **un commit**, non un'operazione: se l'altra persona salva tre spese insieme, l'app fa un commit solo e la riga è una.

Lo stato è un timestamp, `margine.news.seenAt.v1`, che muove **solo l'apertura della campanella** — non l'apertura dell'app: una guardata di tre secondi non deve consumare una novità non letta. È ancorato all'istante del commit più recente conosciuto e non a «adesso», perché con «adesso» un commit arrivato un attimo prima, con l'orologio di GitHub appena indietro, verrebbe inghiottito senza essere mai stato mostrato.

Respinto: registrare autore e istante dentro `Dataset` (migrazione, file più grosso, cieco sul passato). Respinta per ora la notifica a schermo bloccato. Respinta la scheda sul Riepilogo — chiesta e poi tolta da Alessio: con la campanella sarebbe stato un secondo posto per la stessa cosa.

## Consequences

Lo storico è retroattivo su tutto ciò che è già successo e non costa niente ai dati: nessun campo nuovo, nessuna migrazione, nessun byte in più nel file cifrato. E resta vero anche se un giorno l'app cambia: i commit li scrive comunque.

In cambio si eredita il formato del messaggio di commit come **interfaccia**. Chi cambia `describeOps` cambia anche ciò che la campanella sa leggere: il test di parità lo dice, ma va capito che quella stringa non è più solo decorazione della storia di git.

Niente arriva mentre l'app è chiusa: è una campanella, non una notifica. Chi vuole sapere deve aprire.

Il dettaglio costa due letture da 359 KB per commit, pagate solo su ciò che si tocca — e il percorso dichiara cosa sta facendo: «sto leggendo quel commit…» mentre scarica, e il motivo per esteso se non ci riesce, con un «riprova». Un pulsante che scarica mezzo megabyte, fallisce e tace sarebbe ADR-0043 rifatto da capo.

Quando il login non si conosce — nessun token — l'elenco comprende anche i propri commit e il foglio lo **dichiara**, mostrando l'autore invece dell'emoji dell'altra persona. Attribuire per assunzione sarebbe peggio che non attribuire: è lo stesso principio di ADR-0043, dove un messaggio di successo doveva essere la conseguenza di un'operazione riuscita e non del fatto che si era premuto un pulsante.

Come effetto collaterale l'app ora **rilegge i dati** quando torna in primo piano, non più di una volta al minuto. La rilettura riapplica la coda locale sopra ciò che ha letto, come fa `flush` per il commit: sostituire il dataset col remoto e basta farebbe sparire da sotto gli occhi le spese non ancora committate. Non tocca né lo stato né il mese scelto. → ADR-0018
