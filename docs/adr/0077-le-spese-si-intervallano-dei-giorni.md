# ADR-0077: Le spese si intervallano dei giorni

**Status:** accepted · **Date:** 2026-08-31

## Context

La pagina Spese era un nastro di ottanta righe uguali. Ogni riga portava la propria data in mezzo agli altri attributi (`19 ago 2026 · 🍔 Bar e ristoranti · 🧾 Spese condivise`), e da lì bisognava ricostruire da soli dove finisse un giorno e cominciasse il successivo: due spese dello stesso pomeriggio e due a tre settimane di distanza si leggevano identiche.

Alessio: «vorrei che le spese fossero intervallate dai giorni, come fosse un calendario, avendo attenzione di rendere magari in grigetto le spese che sono già segnate ma che fanno capo a data futura».

Le spese datate avanti esistono davvero e non sono un caso di prova: l'affitto del mese prossimo si inserisce presto, e una data sbagliata capita — è stato un refuso su «Spese Modem» a scoprire, in un giorno, quattro difetti diversi (→ ADR-0055, ADR-0063, ADR-0064). Nell'elenco erano indistinguibili da tutte le altre.

## Decision

L'elenco si spezza in **giorni**, e ogni giorno porta la propria intestazione con il **totale del giorno a destra**, incolonnato con gli importi delle righe che gli stanno sotto. Il totale è la quota di chi guarda, come gli importi che somma: un totale su un'altra grandezza non tornerebbe con la colonna che ha accanto.

L'intestazione dice `Oggi`, `Ieri`, `Domani`, o `Lunedì 31 agosto 2026`. L'anno c'è sempre nella forma lunga: la pagina Spese scorre indietro di due anni, e «lunedì 31 agosto» senza anno è ambiguo appena i dati coprono più di un agosto.

Col calendario acceso, la data **sparisce dalla riga**: sta già nell'intestazione, due righe più su e per tutto il gruppo. Ripeterla sarebbe la stessa cosa scritta due volte a otto pixel di distanza.

Una spesa datata dopo oggi si mostra **spenta** — `opacity: 0.55`, che vale per tutto quello che la riga contiene senza doverlo spegnere elemento per elemento — e porta la parola `futura`. Il grigio dice che quella riga è diversa; da solo non direbbe perché.

Il calendario si accende **solo dove l'ordinamento è il tempo**, e lo decide la pagina, che è l'unica a sapere come ha ordinato. Ordinando per importo i giorni tornerebbero sparsi — «31 agosto» tre volte in mezzo alla pagina — e un'intestazione che si ripete non separa niente: sarebbe un calendario mescolato.

## Consequences

Le spese datate avanti hanno finalmente un segno, in tutte le pagine che elencano spese e non solo qui: `today` è **obbligatorio** su `ExpenseList`, con lo stesso motivo per cui lo è su `coupleBalance` (→ ADR-0064) — un valore di ripiego avrebbe voluto dire che una pagina dimenticata le mostra accese senza che nessuno se ne accorga.

Il calendario costa un'intestazione ogni giorno, quindi un elenco molto sparso — una spesa al giorno per ottanta giorni — è più alto di prima. È il caso raro: nei dati veri i giorni con spese ne hanno di solito due o tre.

`dayHeading` e `addDays` stanno in `domain/dates.ts`, con gli altri conti di calendario. `addDays` non fa aritmetica sulle stringhe: senza una data vera, «Ieri» del primo marzo sarebbe il 28 febbraio solo negli anni giusti.
