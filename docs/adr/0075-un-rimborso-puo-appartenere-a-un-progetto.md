# ADR-0075: Un rimborso può appartenere a un progetto

**Status:** accepted · **Date:** 2026-08-31

## Context

ADR-0019 dice che un rimborso non appartiene a nessun tricount: si salda il rapporto per intero, non un gruppo alla volta, e la conseguenza è scritta nella formula — `saldo = opening + somma dei tricount + rimborsi`. È stata una scelta buona per due anni, perché il debito fra Alessio e Federica è sempre stato uno solo: quello della spesa, delle bollette e delle vacanze, che si azzera ogni tanto con un bonifico.

Con la casa di ADR-0074 ne nasce un secondo, e non è dello stesso genere. Alessio anticipa trentaseimila euro; diciottomila sono di Federica e rientrano a rate, per anni. Se quei rimborsi entrassero nel saldo di ogni giorno, ogni rata sposterebbe di migliaia di euro un conto che di solito sta sotto i duecento: per mesi la pagina Saldo direbbe che Alessio deve a Federica, mentre la domanda a cui quella pagina risponde — chi ha pagato l'ultima spesa — resterebbe senza risposta.

Il progetto ha già il suo saldo (`projectStats`). Gli mancava il modo di **abbassarlo**.

## Decision

`Settlement.tricount` diventa un campo facoltativo, ed è valido **solo per un tricount `offBudget`**.

Assente vuol dire «il rapporto di ogni giorno», che resta il caso normale e la regola di ADR-0019 per tutto ciò che non è un progetto. Valorizzato, il rimborso esce dal saldo di ogni giorno ed entra in quello del suo progetto.

Il campo si mette dove si mette il verso: dentro `newSettlement()`. Un rimborso costruito bene in una pagina e male in un'altra sposta un debito senza che se ne accorga nessuno, ed è la ragione per cui quella funzione esiste (→ ADR-0060). La chiave non si scrive **mai vuota**: un `tricount: ''` non è un progetto e non è nemmeno l'assenza — sarebbe una terza cosa che `coupleBalance` non gestisce, e quel rimborso sparirebbe da tutte e due le viste invece che da una.

Il vincolo «solo su un progetto» è presidiato in `validate-core.mjs` e non solo nell'interfaccia, perché è quello che rende il campo sicuro: su un tricount qualunque nessuna pagina lo guarderebbe.

Nella pagina del progetto il modulo per registrare compare a **tutti e due**, come nella pagina Saldo e al contrario del pulsante nel Riepilogo. Non contraddice ADR-0062: là il pulsante sta accanto a una cifra e basta, e a chi incassa chiederebbe di dichiarare un pagamento che non ha fatto lui; qui sopra c'è una riga che dice il verso a parole, e un capitale che rientra a rate lo registra chi tiene il conto della casa — che è l'unico a sapere che quel bonifico è arrivato.

## Consequences

I due debiti restano leggibili separatamente, ed è tutto il punto. Il prezzo è che «rimborso» non è più una cosa sola: chi legge `dataset.settlements` deve chiedersi di quale conto fa parte. Sono due i posti che lo fanno — `coupleBalance` salta quelli di progetto, `projectStats` tiene solo i suoi — e nessun altro deve toccarli.

La pagina Saldo non elenca più i rimborsi di progetto fra i suoi movimenti, quindi non è più da lì che si annullano: si annullano dalla pagina del progetto, dove sono elencati.

Il campo è additivo, quindi nessuna migrazione. I rimborsi già registrati non hanno la chiave e restano quello che sono: il conto di ogni giorno.
