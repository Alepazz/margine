# ADR-0050: Mese e intervallo di date sono lo stesso filtro, e si spengono a vicenda

**Status:** accepted · **Date:** 2026-08-25

## Context

La pagina Spese filtrava il tempo in un modo solo: una tendina con i mesi presenti nei dati. Basta per «quanto ho speso ad agosto», non per «cos'è successo fra il 3 marzo e il 12 aprile» — una domanda che nasce quando si cerca una voce precisa e ci si ricorda il periodo, non il mese; è il caso d'uso della pagina, che esiste per trovare una spesa, non per fare medie.

Aggiungere due estremi `Dal`/`Al` mette però **due controlli sullo stesso asse**. Combinarli in AND, come si fa con categoria e tricount, produce coppie che nessuno vuole davvero interrogare — «Agosto 2026» più «dal 3 al 12 marzo» dà zero voci, e l'elenco vuoto non dice quale dei due filtri l'ha svuotato. Toglierli di mezzo sostituendo la tendina con i due estremi costa il caso più frequente: guardare un mese intero passerebbe da un tocco a due selettori a rotella con sei cifre da girare, e l'app si usa in piedi, con un pollice.

## Decision

I due controlli restano entrambi e si **escludono a vicenda**: scegliere un mese svuota gli estremi, scrivere un estremo riporta la tendina a «Tutti i mesi». Il valore di partenza non filtra niente — tendina su «Tutti i mesi», estremi vuoti, tutte le spese dall'inizio.

La regola sta nella pagina (`pickMonth` e `pickRange` in `src/pages/Spese.tsx`), non nel dominio: `applyFilter` applica `month`, `from` e `to` come condizioni indipendenti e non sa che sono la stessa domanda. È deliberato — il dominio descrive cosa un filtro tiene fuori, l'ergonomia di quale controllo spegne quale è dell'interfaccia. Il conteggio dei filtri attivi però conta il tempo **1**, mai 2, e non si fida dell'esclusione: la legge dallo stato.

Gli estremi sono inclusivi, indipendenti (uno solo dei due è un intervallo legittimo), e stringhe ISO vuote quando assenti — le date delle spese sono ISO, quindi il confronto fra stringhe *è* il confronto fra date, senza `Date` da costruire né fusi da sbagliare. `min`/`max` incrociati sui due campi spengono i giorni impossibili **nel selettore**, che sul telefono è l'unico modo in cui una data si mette. Non sono un vincolo sul valore, e crederlo sarebbe il classico controllo che si dà per fatto: digitata a mano una data fuori intervallo entra lo stesso — il campo resta `:invalid`, `validity.rangeOverflow` è vero, e l'elenco esce vuoto. Verificato, non dedotto. Si accetta: con i due estremi rovesciati uno accanto all'altro, «nessuna spesa» si spiega da sé, e segnalare l'errore col solo colore violerebbe la regola dei token di stato («icona + etichetta sempre accanto: il colore non basta»).

Respinti: i preset («Ultimi 30 giorni», «Quest'anno»), che sarebbero una riga in più pagata a ogni apertura del pannello per una scorciatoia su una scorciatoia — la stessa lezione di ADR-0045.

## Consequences

L'asse del tempo ha un solo filtro attivo alla volta, quindi l'elenco vuoto è sempre spiegabile da ciò che si vede acceso. In cambio, chi cerca «marzo, ma solo la seconda metà» deve scrivere due date invece di combinare tendina e intervallo: la combinazione non esiste per scelta.

Chi aggiunge un terzo modo di filtrare il tempo eredita il vincolo — deve spegnere gli altri due e non aggiungere una tacca al conteggio. E chi togliesse l'esclusione «perché in AND è più semplice» riporterebbe indietro esattamente l'insieme vuoto inspiegabile che questa decisione evita.

Su telefono i due estremi si prendono una riga sola e stanno in coppia (`.filter-range`), con l'etichetta **sopra** il campo: accanto, con il campo a 16px — la misura sotto la quale iOS ingrandisce la pagina — «gg/mm/aaaa» più il riquadro non stanno in metà schermo. Misurato a 390px e a 320px: nessuno sbordamento, campo non tagliato. → ADR-0033, ADR-0046
