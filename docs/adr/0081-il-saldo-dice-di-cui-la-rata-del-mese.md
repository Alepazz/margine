# ADR-0081: Il saldo dice «di cui», e la finestra è il mese

**Status:** accepted · **Date:** 2026-09-01

## Context

Da ADR-0079 la rata del mutuo di un progetto entra nel saldo di ogni giorno, insieme al pane e alle bollette. È giusto — è un debito come gli altri, e si salda con gli altri — ma rende il saldo meno leggibile: una cifra che prima era fatta di spese da decine di euro adesso contiene anche una rata da centinaia.

Alessio, il 01/09/2026: «nel Riepilogo c'è l'importo da ricevere/saldare e adesso ci dovrà essere anche un "di cui", ovvero 539 di cui 200 per casa a Senigallia. Questo "di cui" deve tenere conto solo dell'affitto, mentre Rogito e caparra sono fuori come detto, invece frigo e altri prodotti per la casa a Senigallia sono già nel totale 539−200. Insomma 200 € è solo ed unicamente la parte di mutuo di quel mese».

Il problema è che **il saldo non si decompone**. È cumulativo — tutto dal punto di partenza a oggi, meno i rimborsi — e nessun rimborso dichiara cosa sta pagando. Non esiste un modo non arbitrario di dire quanta parte di quei 539 € sia mutuo: servirebbe una regola di imputazione, e qualunque regola si scelga è una convenzione che nessuno ha chiesto.

Le due finestre possibili erano quindi:

- **dall'ultimo rimborso in poi**: una vera fetta del saldo, finché ogni rimborso lo azzera. Ma i rimborsi parziali sono ammessi e si usano, e dopo uno parziale il conto ripartirebbe da zero mentre il debito di mutuo no — sottostimerebbe, in silenzio;
- **il mese**: non è una fetta esatta del saldo, ma è **vero comunque sia andata prima**.

Alessio ha scelto il mese.

## Decision

`recurringDeltaOf(expenses, tricount, month, today)` somma quanto le spese della **categoria collegata al progetto**, in quel mese, spostano il saldo. Col segno fisso del saldo, e con la stessa soglia sul futuro (→ ADR-0064): una rata di ottobre non è ancora un debito, quindi non è ancora un «di cui».

La categoria è il filtro, e non «le spese ricorrenti del progetto»: il condominio di quella casa un domani sarà ricorrente pure lui, e finirebbe dentro un numero che Alessio ha definito «solo ed unicamente la parte di mutuo».

La frase la costruisce `diCuiLabel()`, e **nomina il mese**: «di cui 320 € di mutuo di settembre». È lì che il numero smette di pretendere di essere una fetta esatta del totale: se non vi saldate da tre mesi, dentro il saldo di mutuo ce n'è di più, e la frase resta vera perché parla di settembre.

Quando la rata pende **dal verso opposto** al saldo — l'altra persona l'ha anticipata questo mese, ma nel complesso è lei a doverti — «di cui» direbbe il falso, perché quel numero non è dentro il totale: lo abbassa. Per quel caso la frase cambia: «320 € di mutuo di settembre tirano dall'altra parte». È l'unica ragione per cui questa è una funzione con un test invece di un'interpolazione scritta sul posto.

Il mese è **oggi**, non quello scelto nella striscia: il saldo non cambia col mese (→ ADR-0058), e legandogli un «di cui» che cambia si sarebbe visto un dettaglio muoversi sotto un totale fermo.

Le righe le costruisce `useBalanceBreakdown()`, un posto solo, perché a mostrarle sono due pagine — il Riepilogo e il Saldo — e devono spiegare lo stesso numero con la stessa frase.

## Consequences

Il saldo dice da cosa è fatto, nella parte che altrimenti sorprenderebbe.

La conseguenza da conoscere è che **nei primi giorni del mese la riga non c'è**: la rata di settembre non è ancora stata registrata, e il «di cui» di settembre è zero — mentre nel saldo la rata di agosto c'è ancora. È il prezzo della finestra scelta, ed è il caso opposto a quello che l'ha fatta scegliere: si è preferito un numero che non c'è a uno che c'è e sbaglia.

Nel Riepilogo la riga sta **dentro** `hero-balance-foot`, non come quarta riga della metà del saldo: `subgrid` allinea tre righe e una quarta uscirebbe dalla sua campata (→ ADR-0060). Nella pagina Saldo quel vincolo non c'è, e la riga è una riga.
