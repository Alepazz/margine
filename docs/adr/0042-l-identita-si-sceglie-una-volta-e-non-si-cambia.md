# ADR-0042: L'identità del dispositivo si sceglie una volta e non si cambia dall'app

**Status:** accepted · **Date:** 2026-08-21

## Context

L'ADR-0038 aveva spostato l'identità dalla testata a Impostazioni e aveva scritto, come conseguenza accettata: «cambiare identità resta possibile ed è **volutamente scomodo**: è il modo per dare un'occhiata ai numeri dell'altra persona». Costava quattro tocchi, e il baratto era consapevole.

Ora che Federica usa l'app davvero, Alessio ha chiesto l'opposto: «da Fede non deve essere possibile passare a vedere la mia UI, e viceversa». Quattro tocchi non sono una barriera fra due persone che si passano il telefono; sono un menù.

Leggendo il codice è venuto fuori un difetto peggiore del controllo, e nessuno l'aveva visto perché non si manifesta su un dispositivo già configurato: `readStoredPerson()` faceva `raw === 'partner' ? 'partner' : 'me'`, cioè **il valore di ripiego era una persona vera**. Un telefono appena aperto, o uno a cui vengono svuotati i dati del sito, partiva dalla vista di Alessio — compreso il suo compartimento personale — senza che nessuno avesse scelto niente. La cosa che l'ADR-0038 voleva impedire (aprire il compartimento dell'altro senza volerlo) era il comportamento predefinito di ogni installazione nuova.

Sulla via d'uscita c'erano tre strade, e Alessio ha scelto la prima:

- **Nessuna via dall'app.** Per riassegnare un dispositivo si svuotano i dati del sito dal browser e si rimettono passphrase e token.
- **Un reset in Impostazioni** («dimentica questo dispositivo»): più gentile, ma è comunque un modo di cambiare identità in tre tocchi — la cosa da impedire, con un travestimento.
- **Chiedere la passphrase per cambiarla**: sembra una serratura e non lo è, perché la passphrase la sanno entrambi. Fermerebbe un ospite, non loro due.

## Decision

L'identità si chiede **una volta**, in una schermata che sta fra lo sblocco e l'app (`IdentityGate`), con una conferma esplicita perché il gesto è irreversibile dall'interfaccia. Dopo, in Impostazioni si **legge** di chi è il dispositivo e da quando: nessun controllo per cambiarla.

Tre cose la tengono in piedi, e sono tre perché una sola sarebbe un pulsante nascosto:

- **Non esiste un valore di ripiego.** `readIdentity()` torna `undefined` quando la scelta non c'è. Era il difetto vero, ed è la parte di questo ADR che vale anche senza la richiesta di Alessio.
- **Il rifiuto sta nello store, non nell'assenza del pulsante.** `chooseIdentity()` non scrive se una scelta esiste già, e lo verifica su `localStorage` e non sullo stato di React — due schede aperte insieme condividono il primo e non il secondo.
- **`useReadyStore()` non apre senza identità.** È la porta da cui passano tutte le pagine: nessuna può renderizzare con l'identità di ripiego, quindi togliere la schermata da `App` non basterebbe a riaprire la falla.

Questo ADR **non sostituisce l'ADR-0038**, che resta `accepted`: la sua decisione — l'identità sta nel dispositivo e non nella testata, un telefono una persona — vale tutta, e questo ADR ne è la conseguenza portata fino in fondo. Cambia **un paragrafo**: quello su «cambiare identità resta possibile ed è volutamente scomodo». Non è più possibile. (È la stessa forma con cui l'ADR-0038 aveva cambiato un paragrafo dell'ADR-0007.)

## Consequences

Si perde del tutto il gesto di guardare i numeri dell'altra persona — quello che Alessio aveva chiesto in origine e che l'ADR-0038 aveva conservato a fatica. È lui a rinunciarci, sapendo il prezzo: per vedere i numeri di Federica ora si guarda il suo telefono.

Un tocco sbagliato alla prima apertura costa svuotare i dati del sito e rimettere passphrase e token. Per questo la scelta chiede una conferma che dice **cosa comporta**, invece di un elenco a due voci che si tocca per sbaglio.

I dispositivi già configurati non cambiano niente: la chiave `margine.person.v1` resta quella e il suo valore vale come scelta fatta. Non sanno però **quando** è stata fatta — `margine.person.since.v1` nasce adesso — quindi la scheda mostra la data solo se la conosce, invece di inventarne una. Un dispositivo che non avesse mai toccato il vecchio controllo si vede la schermata una volta: un tocco, e non è un guasto.

E resta il limite di sempre, che va detto ogni volta che si tocca questa zona: **non è una serratura**. La passphrase è una sola e apre tutto il file, quindi chi vuole leggere il compartimento dell'altro ci arriva dagli strumenti del browser o con `npm run decrypt` (→ ADR-0039). Questo ADR toglie **il gesto**, non la possibilità; la garanzia vera resta un file cifrato per compartimento, ed è ancora la strada scartata dall'ADR-0039. La frase sta anche a schermo, sotto la scheda, perché fra sei mesi il ricordo sarà «l'identità è bloccata» e non «il gesto è stato tolto».
