# ADR-0016: Oscurare i guadagni azzerando i campi, non velando i numeri

**Status:** accepted — la portata del velo e la conseguenza sulla barra sono superate da ADR-0066 · **Date:** 2026-08-20

## Context

Alessio vuole poter coprire quanto guadagna — *«tutto quello che riguarda i miei guadagni, non le mie spese»* — perché l'app si usa in piedi, in treno, con qualcuno accanto. Le spese non gli interessa nasconderle: le entrate sì.

Le entrate compaiono in due soli posti, la scheda del margine e il profilo entrate nelle impostazioni. Ma **coprire la riga «entrate» non copre le entrate**, e questo è il vincolo che decide tutto il resto. Ogni altro numero della scheda le restituisce (cifre d'esempio, negli stessi rapporti di quelle vere: → ADR-0067):

```
margine 1900 + speso 400                       = 2300
speso 400 diviso la quota spesa 17%            ≈ 2353
spendibile 1100 + 250 + 550 + 380              = 2280
e il riempimento della barra È la quota spesa, senza leggere nessuna cifra
```

Quindi l'oscuramento deve coprire tutto ciò che **deriva** dalle entrate e neutralizzare la geometria della barra, altrimenti è teatro. La cosa fortunata è che si può nascondere il **livello** conservando lo **stato**: «sotto controllo · 11 giorni alla fine · speso 400 €» non dice quanto guadagni e resta utile.

Un secondo vincolo, tecnico: i test del progetto sono di dominio e dati, senza React Testing Library né jsdom. Una regola di sicurezza che vive dentro un componente non è presidiabile da nessun test.

## Decision

L'oscuramento **non vela il numero nella vista: non dà il numero alla vista.** Una funzione pura, `marginView(result, { hideIncome })`, restituisce lo stesso oggetto con i campi segreti a `null`; il componente disegna `••••` dove trova `null`. A schermo coperto la cifra non è nel DOM, non è in una `aria-label`, non è da nessuna parte.

La lista è di **ciò che resta visibile**, non di ciò che si nasconde:

```
known · status · spent · projectedSpent · expectedFixed · variableSpent · fixedStillDue
```

Sono campi che parlano di spese, o di impegni ricavati dalla storia delle spese. Tutto il resto è segreto **per difetto**, quindi un campo nuovo in `MarginResult` nasce coperto. Al contrario prima o poi qualcuno ne aggiungerebbe uno dimenticandosi di elencarlo. Un test di dominio scorre le chiavi del risultato vero e pretende che ogni campo fuori da quella lista sia `null`; la lista è riscritta a mano nel test, così allargare ciò che si vede fa cadere il test invece di passare in silenzio.

La barra, a guadagni coperti, diventa **piena e tratteggiata**: un riempimento parziale *è* la quota spesa, e una barra vuota direbbe il falso, cioè «non hai speso niente».

Il comando è **il numero stesso**: si tocca dov'è già l'occhio, e la testata non deve trovare posto per una quarta icona accanto a tema, viste e impostazioni. Il tocco vale per la **sessione**; quello che persiste è il default, scelto nelle impostazioni fra «in chiaro» e «oscurati». Se persistesse il tocco, la prima volta che scopri il numero resteresti scoperto per sempre — l'opposto di quello che serve.

Il default vive in `localStorage`, come la persona scelta e il token: «questo telefono parte coperto» è una proprietà del telefono, non dei dati. E nei dati non potrebbe stare comunque, perché l'app scrive solo `expenses.json.enc`, non la configurazione.

## Consequences

Il livello dei guadagni si copre davvero, e resta utilizzabile quello che serve tutti i giorni: quanto hai speso, in che categorie, con che ritmo. La regola sta in una funzione pura con un test che la presidia, quindi non si sfalda al primo componente nuovo.

Due prezzi, entrambi dichiarati. Il primo: la pastiglia dello stato resta visibile, e dire «sotto controllo» rivela che le entrate stanno sopra la spesa proiettata — **una soglia, non una cifra**. È inevitabile conservando lo stato, ed era il senso della scelta; chi volesse coprire anche quello nasconde la pastiglia.

Il secondo: il saldo con Federica, quando arriverà, **non è coperto** da questa decisione. Non sono guadagni, sono soldi che ci si deve, e Alessio ha scelto di lasciarli in chiaro. Quel numero però è forse il meno adatto a essere letto da un estraneo accanto, quindi la scelta va richiesta quando la pagina esisterà davvero e si vedrà l'effetto.
