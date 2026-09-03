# ADR-0095: La lista della spesa fa una riga sola, senza nome e senza numero

**Status:** accepted · **Date:** 2026-09-03 · Prima eccezione alla regola «una riga per cosa» di ADR-0052

## Context

Ogni cosa aggiunta alla lista è un commit suo: il 03/09/2026 la storia vera ne porta quattro di fila, tutti «1 cosa aggiunta alla lista». ADR-0091 aveva già zittito le spunte — prendere e rimettere sono i gesti più frequenti dell'app — ma aveva lasciato le aggiunte a una riga ciascuna, sul ragionamento che un'aggiunta *è* una richiesta e l'altra persona la deve vedere.

Il ragionamento reggeva per una cosa e cade per venti. Alessio, il 03/09/2026: «"Alepazz ha aggiunto una cosa alla lista" è troppo rumore, per ogni elemento. Direi che metterei una generica notifica e fine, che compare ogni volta che c'è almeno un elemento non ancora visualizzato tramite campanella».

Il vincolo che esclude le mezze misure: **il numero sul pallino è il numero di righe** (→ ADR-0052, ADR-0061). Quindi non esiste una soluzione che tenga venti righe e un pallino a 1: la riga e il numero sono la stessa cosa, e vanno ridotti insieme o non si riduce niente. E la riduzione non può stare nel foglio che disegna, o il pallino prometterebbe righe che il foglio non ha — difetto già misurato una volta, 23 contro 21.

## Decision

Un gruppo può **collassare**: tutte le sue novità, per quante siano e da quanti commit, fanno una riga sola. La tabella è `COLLAPSED_GROUPS` in `src/domain/changes.ts`, e il valore **è la frase** — così quali gruppi collassano e cosa scrivono sono un'informazione sola, che non può divergere. È parziale e non totale di proposito, contro il riflesso del progetto: qui il ripiego di un gruppo nuovo è «non collassa», cioè il comportamento di sempre, e la totalità si paga dove il ripiego fa danno — `fileOf`, `targetOf`, e `MONEY_FIELDS` qui accanto. Oggi ne collassa uno: la lista della spesa, con «Ci sono cose nuove nella lista della spesa».

La riga collassata **non ha un soggetto** — le cose in lista possono averle messe tutti e due — e **non ha uno sha**, perché sta a cavallo di quanti commit servono. Porta l'istante della novità **più recente** del gruppo: è ciò che riaccende il pallino quando ne arriva un'altra dopo che hai guardato. Con quello della più vecchia la riga risulterebbe già vista per sempre.

Collassano **tutte** le operazioni non mute del gruppo: aggiunte, modifiche, eliminazioni. Scartata l'alternativa di collassare le sole aggiunte e lasciare righe proprie a modifiche ed eliminazioni: sono più rare delle aggiunte, quindi lasciarle rumorose rimetterebbe il rumore esattamente dove serve meno. Scartato anche il collasso **per commit**, che non risolve niente: ogni cosa aggiunta è già un commit a sé.

Il *cosa* non ci sta, e non è una perdita: sta nella lista, che è il posto dove serve saperlo — la stessa ragione per cui le spunte tacciono (→ ADR-0091). Qui basta sapere che c'è qualcosa da guardare.

## Consequences

`noticesOf` ordina la propria uscita per istante, cosa che prima non serviva: l'ordine dei commit bastava. L'ordinamento di JavaScript è stabile per specifica, quindi le righe di uno stesso commit — che condividono l'istante — restano nell'ordine in cui sono costruite, e per le righe che esistevano prima l'ordinamento è un'operazione nulla.

`NoticeItem` prende un terzo caso, e il compilatore ha fatto il suo lavoro appena aggiunto: `testoDi` in `NewsSheet.tsx` non compilava più, perché compone una frase attorno a un soggetto e una riga collassata non ne ha. La firma ora dichiara l'esclusione (`Exclude<NoticeItem, { kind: 'group' }>`) invece di gestire un caso che non le appartiene.

Venti cose aggiunte fanno un pallino a **1**. È il punto, ed è anche il compromesso: chi guarda non sa se ne è arrivata una o venti, e lo scopre aprendo la lista.

Quello che resta da fare: la riga non è toccabile per aprire la lista. Sarebbe il gesto naturale — la riga dice «vai a vedere» e non ci porta — ma il foglio delle novità non ha una navigazione, e aggiungerla è un lavoro suo.
