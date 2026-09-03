# ADR-0089: Lo storico è il catalogo, e la lista è solo ciò che resta da prendere

**Status:** accepted · **Date:** 2026-09-03

## Context

La domanda che ha cambiato la forma della lista è cosa succede a una cosa spuntata. Nell'intervista era una scelta fra tre — resta barrata finché non svuoti, sparisce da sola dopo qualche ora, sparisce subito — e Alessio ha risposto con una quarta, che è un modello e non un'opzione:

«Al click su un prodotto quel prodotto viene messo nel carrello quindi esce dalla spesa. Se lo si rimuove dal carrello viene rimesso nella spesa. La lista deve essere solo un elenco di cose che vanno prese, quindi quello che c'è è tutto quello che è ancora da prendere, quello che è nel carrello è già stato preso, che sia appena stato preso oppure mesi fa. Deve funzionare come l'app Bring».

La parte che decide è «**oppure mesi fa**». Se una cosa presa non scade e non si cancella, quell'insieme non è un elenco di cose fatte da svuotare: è il **catalogo dei prodotti di casa**, che si stabilizza intorno al vocabolario di una famiglia — un centinaio di voci, forse duecento — perché ogni «Latte» successivo è la stessa voce che va e torna.

E **non si chiama «il carrello»**. La prima versione lo chiamava così, e Alessio l'ha corretto guardandola: «non è nel carrello, ma è proprio il passato, quello che è stato preso storicamente oppure 1 secondo fa». Un carrello è una cosa che si svuota alla cassa; questo no, e il nome sbagliato faceva promettere all'interfaccia un gesto che non esiste. Si chiama **lo storico**, in italiano e nel codice (`taken`, non `inCart`).

## Decision

La lista mostra **due insiemi**: «Da prendere» (`takenAt` assente) e «Già preso» (`takenAt` presente, dal più recente). Un tocco su una riga la sposta da un insieme all'altro. Lo storico mostra dodici voci con «mostra tutte», perché dopo qualche mese contiene tutto.

Da questo discende una **semplificazione**: la «memoria dei prodotti» con le pastiglie «Ricompra», che nell'intervista era una proposta a sé, non è un meccanismo separato — è lo storico guardato da un altro lato. Riaggiungere una cosa presa mesi fa la riporta in lista con la sua quantità, il suo negozio e la sua nota. Un meccanismo in meno da costruire e da tenere in piedi.

Due conseguenze del modello, che sono le decisioni vere:

**Una cosa che c'è già non si duplica.** Scrivere «Caffè» nel modulo quando un «Caffè» sta nello storico riporta in lista **quello**, non ne crea un secondo; e se è già fra le cose da prendere l'app lo dice invece di aggiungere una riga identica sotto quella che c'è. Senza questa regola ogni giro lascerebbe un doppione nel catalogo, e dopo un mese nessuno riconoscerebbe più quale sia la voce buona. Il confronto è sul **nome normalizzato** (`nameKey`), la stessa chiave con cui i prezzi raggruppano.

**Un campo vuoto nel modulo vuol dire «tieni quello di prima».** È un difetto trovato al banco: scrivendo «caffè» per riportare in lista il «Caffè» dello storico, il confronto campo-per-campo rinominava la voce con la grafia sciatta appena digitata e — peggio — **cancellava** il negozio e la nota che la voce ricordava, perché nel modulo erano vuoti. Ma lo storico *è* la memoria: un campo vuoto là non è un'istruzione. Quindi `revivedFields` non tocca mai il titolo (la grafia buona è quella salvata) e scrive gli altri campi solo se c'è qualcosa da scrivere. Per cambiare davvero il nome, o per togliere un negozio, c'è la matita — che è un gesto diverso e passa da un confronto diverso. La regola vive nel dominio, con cinque test, perché l'ho trovata provando e non leggendo.

**Il bersaglio è la riga intera**, non una casella da sedici pixel: si tocca in piedi, con un pollice, davanti allo scaffale. Correggere sta dietro una matita e non dietro un tocco lungo, che non si scopre e su iOS fa comparire la selezione del testo. La matita sta **fuori** dal pulsante della riga, perché due pulsanti annidati non sono HTML valido.

**Una riga è un titolo, e tutto il resto è un'informazione in più.** La quantità sta **incollata al titolo** — «Latte 2 L» è una cosa sola — e negozio, nota e prezzo noto scendono nella riga di contorno, dove compaiono solo se ci sono.

La prima versione faceva l'opposto: incolonnava la quantità al bordo destro come gli importi delle spese, e **raggruppava le righe per negozio** con le intestazioni di ADR-0077. Bocciata da Alessio guardandola: «è poco da colpo d'occhio, ovvero quantità è lontana dal titolo ed il raggruppamento per supermercato è poco efficiente». La ragione è che avevo trattato negozio e quantità come dimensioni della lista, mentre sono **eccezioni**: «sappiamo in quale supermercato andiamo il 99% delle volte quindi non serve specificarlo», e «magari a noi basta scrivere un generico Carne e la quantità la si vede poi». Un raggruppamento per un campo che il 99% delle voci non ha produce un gruppo «Ovunque» con tutto dentro più qualche riga di rumore.

Conseguenza sul modulo: i tre campi facoltativi — quantità, negozio, nota — **non si vedono**, stanno dietro un pulsante, e aggiungere una cosa è un nome più Invio. Il campo della quantità aveva anche un «1» come segnaposto, che «è fuorviante», perché un campo visibile è una domanda e a queste tre la risposta è quasi sempre nessuna.

**Il negozio però non è un dettaglio: è un avviso.** Se una voce lo porta, quasi sempre vuol dire «questa non la prendere qui», e Alessio l'ha detto meglio di come l'avevo disegnato: «se leggo il supermercato è perché probabilmente quello non devo prenderlo nel supermercato in cui sono, quindi non è per ora. Mi deve risaltare così evito di prendere cose che non siano previste per la spesa che sto facendo». Metterlo in fila con la nota e il prezzo, in grigio, ne faceva un'informazione che si legge dopo aver già messo la cosa nel carrello.

Quindi è una **pastiglia con la tinta d'avviso**, prima di tutto il resto del contorno, e dice «Solo a Ferramenta» invece del solo nome: la parola c'è perché in questo progetto **il colore non porta mai il significato da solo** (→ ADR-0009), e «Solo» è ciò che trasforma un'etichetta in un'istruzione. Riusa la pastiglia `attenzione` che esiste, con un fondo appena più caldo dentro le righe della lista: la riga si accende al passaggio del mouse con `--surface-2`, che è anche il fondo della pastiglia, e senza quel ritocco sparirebbe proprio mentre la si indica. Contrasto misurato del testo sul suo fondo: 5,50:1 col tema chiaro e 7,79:1 col tema scuro, sopra il 4,5:1 che WCAG chiede al testo piccolo. E la «a» la sceglie `aTo()`, che esiste da ADR-0059 per la stessa ragione: «Solo a Coop» e «Solo ad Esselunga».

## Consequences

Il carrello cresce di proposito, e non c'è nessuna pulizia automatica: una cosa presa per sbaglio si rimette in lista con un tocco, e una voce una tantum («cornice per il quadro») resta in fondo al catalogo finché qualcuno non la cancella dalla matita. Cancellare da sé una voce dopo qualche giorno sarebbe perdere in silenzio la parte del modello che vale — il catalogo — per risparmiare qualche kilobyte.

La validazione dei file avvisa oltre le cinquecento voci. Non è un errore: è il momento in cui vale la pena potare.

Il costo dichiarato: **un refuso crea una voce nuova**. «Latte» e «Latte intero» sono due prodotti, e nel catalogo restano due. È lo stesso prezzo dei prezzi a scaffale (→ ADR-0041), e ciò che lo rende raro è il suggerimento sotto il campo — che qui compare **solo dopo aver scritto qualcosa**, perché col campo vuoto i sei suggerimenti riempiono tre righe e spingono «Quanto» sotto la piega, visto al banco, e non servono: l'elenco dei soliti è il carrello, che sta già nella pagina.
