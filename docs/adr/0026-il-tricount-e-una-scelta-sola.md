# ADR-0026: Il tricount si scegli una volta sola, coi nomi veri

**Status:** accepted · **Date:** 2026-08-20

## Context

Alessio, dopo aver provato l'app dal telefono: «manca tutta la funzione di Tricount. Tricount infatti ci fa segnare dove vogliamo mettere la spesa che stiamo tracciando, e deve essere possibile scegliere tra Perché non sono Ric(c)a, Personale, Spese casa e le vacanze».

La funzione **c'era**. Il modulo aveva un campo «In quale registro» con tutte e quattro le origini. Il problema era che non era riconoscibile come quella cosa, per due ragioni indipendenti.

La prima: i nomi. Il menù mostrava «Spese fisse condivise», «Spese personali», «Altre spese condivise» — nomi che ho inventato io durante l'import per descrivere che tipo di tricount fosse ciascuno. I suoi tricount si chiamano «Spese casa», «Personale», «Perché non sono Ric(c)a». Chi cerca il proprio tricount in un elenco cerca il **suo nome**, non una descrizione della sua natura, e non trovandolo conclude che la funzione non c'è.

La seconda: la forma. Il registro era una tendina e il viaggio un'altra tendina che compariva dopo, e le vacanze elencate erano tutte e cinque, comprese quelle finite un anno fa. Su Tricount i gruppi sono una **lista piatta** e ogni vacanza è un gruppo come gli altri: la domanda «in quale dei miei tricount va questa spesa?» è una, e chiederla in due passaggi la fa sembrare un'altra cosa.

## Decision

Un selettore solo, con i nomi veri: i tre tricount fissi più le vacanze **aperte**, dalla più recente. La chiave del selettore è `fisse` | `personali` | `condivise` | `vacanze/<idViaggio>`, ed è **la stessa chiave con cui il saldo raggruppa i tricount** — `ledgerKeyOf` la produce, `coupleBalance` la consuma, `balance.groups` la usa come chiave di configurazione. Un formato nuovo sarebbe stato un secondo modo di dire la stessa cosa, e due modi di dire la stessa cosa divergono al primo caso strano.

I nomi veri stanno in `config.sourceLabels`, cioè **nei dati e non nel codice**. Il repo è pubblico e i dati no: «Perché non sono Ric(c)a» è un nome che Alessio e Federica hanno dato a un tricount loro, e non ha ragione di stare in un file che chiunque può leggere. Il codice porta i nomi generici come ripiego, e ogni installazione mette i propri.

`SOURCE_LABELS` resta come valore di ripiego, e la risoluzione passa da una funzione pura, `sourceLabelOf`. Il selettore riceve quella, non il `lookup` delle categorie: il nome di un tricount non ha niente a che fare coi colori dei grafici, e fargli attraversare tre livelli un oggetto costruito su un tema di grafico sarebbe una dipendenza inventata.

In un tricount di vacanza il selettore della categoria mostra **direttamente le cinque voci di viaggio** — alloggio, trasporti, attività, mangiare, souvenir — invece delle tredici categorie. La categoria è una sola in vacanza («Viaggi», per decisione di Alessio: «Viaggi è la categoria, di default, dei viaggi, una unica per tutte le spese»), quindi chiederla sarebbe un tocco per una domanda con una sola risposta.

## Consequences

Il menù dell'app e la schermata di Tricount adesso dicono le stesse parole, che è la condizione perché un numero calcolato qui si possa credere confrontandolo con là. Vale anche fuori dal modulo: i filtri della pagina Spese, la pagina Casa, la pagina Saldo, l'export CSV — tutti passano da `sourceLabel`, quindi hanno cambiato nome insieme.

La lista si accorcia da sé man mano che le vacanze si concludono (→ ADR-0027), che è la ragione per cui quel flag esiste.

C'è un caso che va gestito e che non è ovvio: aprendo in correzione una spesa di **due anni fa**, il suo tricount può essere una vacanza conclusa e quindi fuori dal menù. Un menù che non contiene il valore corrente mostrerebbe il primo della lista, e salvare sposterebbe quella spesa in un altro tricount senza che nessuno l'abbia chiesto — cioè un debito che si sposta da solo. Il tricount della spesa che si sta correggendo compare sempre, marcato «conclusa». C'è un test dedicato, perché è un difetto che si vedrebbe solo mesi dopo, in un saldo che non torna.

`balanceGroupOf` in `selectors.ts` è stata **eliminata** e sostituita da `ledgerKeyOf`: facevano la stessa cosa con due nomi, ed è esattamente la divergenza che questa decisione vuole evitare.
