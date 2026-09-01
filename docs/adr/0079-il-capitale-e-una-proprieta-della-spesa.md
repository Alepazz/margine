# ADR-0079: «Fuori dai conti del mese» è una proprietà della spesa, non del tricount

**Status:** accepted · **Date:** 2026-09-01

## Context

ADR-0074, scritto il giorno prima, ha messo l'interruttore sul **tricount**: `Tricount.offBudget`, e `visibleFor()` butta fuori tutto ciò che vive lì dentro. Reggeva finché in quel tricount c'era una cosa sola — il capitale di una casa comprata.

Il 01/09/2026 Alessio ha detto cosa ci finirà davvero dentro, e sono tre cose che si comportano in modo opposto:

- il **capitale** — compromesso, rogito, notaio, agenzia: poche voci grandissime, concentrate in due o tre mesi, che rientrano a rate negli anni;
- la **rata del mutuo** — «dovrà essere messa su Casa Senigallia e dovrà comparire in tutte le statistiche (tra cui spese fisse ecc)»: la vita di ogni mese, che sostituisce l'affitto e deve erodere il margine come lui;
- le **spese correnti** — «tutte le spese per Casa Senigallia che sono fuori da Notaio, Compromesso, Rogito, ecc, dovranno apparire in tutte le statistiche, tra cui appunto spese mensili. Chiaramente ci saranno diversi una tantum»: il frigo, i mobili, i lavori.

Con l'interruttore sul tricount le ultime due sparivano insieme alla prima. La rata del mutuo non sarebbe comparsa fra le spese fisse — cioè lo spendibile sarebbe stato ottimista di una rata **per sempre**, non solo nei primi mesi — e il frigo sarebbe uscito da ogni media senza che niente lo dicesse. Un interruttore per tutto il tricount ne avrebbe per forza sbagliato uno dei due.

L'alternativa era tenere la rata e il frigo **fuori** dal tricount del progetto, in quello delle fisse, riconoscendoli per categoria: è quello che ADR-0074 aveva previsto con `recurringCategory` e `projectRecurring()`. Ma Alessio ha chiesto l'opposto — «chiaramente devono tutte fare capo alla casa di Senigallia» — e ha ragione: sono spese di quella casa, e volerne il totale «con e senza rogito» è una domanda che si fa con un filtro, non cercandole in due tricount.

Il momento era l'unico buono: il tricount esisteva ma era ancora **vuoto** — zero spese, zero rimborsi, nessuna categoria collegata. Dopo l'inserimento dei trentaseimila euro lo stesso cambio sarebbe costato una migrazione.

## Decision

L'interruttore scende dal tricount alla **singola spesa**: `Expense.offBudget`.

`Tricount.offBudget` diventa `Tricount.project`, e cambia significato: essere un progetto vuol dire avere **una pagina propria** e un **compartimento di rimborsi proprio** (→ ADR-0075). Non vuol più dire «le mie spese stanno fuori dai conti».

`visibleFor()` e `coupleBalance()` escludono `isCapital(expense)` invece di un insieme di id, quindi `Perimeter` torna al solo insieme delle vacanze e `offBudgetIdsOf()` sparisce. `projectStats()` spacca il progetto in tre insiemi — `capital`, `current`, `recurring` — e il debito del progetto lo genera **solo il capitale**: la rata e il frigo stanno già nel saldo di ogni giorno, e contarli anche lì vorrebbe dire chiederne il rimborso due volte. `recurringCategory` sopravvive col compito rovesciato: non serve più a cercare la rata **fuori** dal progetto, serve a riconoscerla **dentro**.

**La spunta nasce spenta, anche dentro un progetto**, ed è la scelta fra due guasti. Dimenticarla su un rogito manda il mese a picco e te ne accorgi in un secondo; dimenticare di **spegnerla** su un frigo lo farebbe sparire in silenzio da ogni media, per sempre. Fra un guasto rumoroso e uno muto si sceglie il rumoroso — è la ferita di ADR-0057 letta al contrario.

E il capitale esiste **solo dentro un progetto**: fuori, una spesa che sparisce dal mese e dal saldo non avrebbe nessuna pagina che la rimetta sotto gli occhi. Lo rifiutano tutti e due i validatori.

## Consequences

Le tre cose vanno dove devono: la rata fra le spese fisse e dentro il saldo di ogni giorno, il frigo fra le variabili, il capitale fuori da tutto e dentro la pagina del progetto. La domanda «quanto ci è costata Senigallia, con e senza rogito» ha una risposta in una riga sull'intestazione della pagina, e un filtro sull'elenco.

Il prezzo è che **una spesa in più chiede una decisione**. Prima il tricount decideva per tutte; ora, dentro un progetto, chi inserisce deve sapere se quella voce è capitale. La casella si vede solo lì e porta gli esempi con sé, ma resta un posto in cui si può sbagliare in silenzio — nella direzione meno grave, per costruzione.

Secondo prezzo, meno ovvio: le spese correnti di un progetto **entrano nelle raccolte per categoria**. L'imbianchino della casa nuova ha categoria «Casa», quindi compare nella pagina Casa e nella sua media al mese, accanto alle bollette di quella dove si abita. È corretto rispetto alla decisione — «devono apparire in tutte le statistiche» — ma è esattamente il perimetro che ADR-0074 aveva stretto un giorno prima, riaperto per metà: `everyday` ora toglie il **capitale**, non il progetto.

Terzo: ADR-0074 resta valido in tutto il resto — il concetto di progetto, la pagina, il fatto che un capitale non entri nei conti del mese — ma la frase «un progetto è un tricount `offBudget`» non è più vera. Il suo stato lo dichiara.

Il cambio non è costato nessuna migrazione dei dati veri, perché il tricount era vuoto. È costato una riga in `data/expenses.json` — `offBudget: true` diventato `project: true` sull'unico tricount che ce l'aveva — fatta al Mac e ricifrata.
