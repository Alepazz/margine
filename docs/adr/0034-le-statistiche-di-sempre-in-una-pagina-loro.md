# ADR-0034: Le statistiche che non guardano il mese stanno in una pagina loro

**Status:** accepted · **Date:** 2026-08-21

## Context

Il Riepilogo si apre con la striscia dei mesi, che è il comando principale della pagina: si tocca un mese e la pagina racconta quel mese. Solo che non tutta: «Andamento mensile» mostrava diciotto mesi e «Composizione della spesa» dodici, e nessuna delle due cambiava scegliendo un mese diverso — la prima si limitava a marcare il mese scelto sulla linea.

Alessio, usandola: «alcune voci, come Andamento mensile e composizione della spesa non fanno riferimento al mese selezionato, quindi forse sposterei queste informazioni in una voce statistiche dentro i ⋯ + tutto quello che ci puoi / vuoi mettere come statistiche».

Il problema non è che quelle due schede siano inutili — sono le più belle da guardare. È che **un selettore che cambia metà della pagina è una promessa non mantenuta**: chi tocca «marzo» e vede due schede su sei restare identiche non impara «quelle sono statistiche di lungo periodo», impara «questo comando non funziona bene».

## Decision

Una pagina nuova, `/statistiche`, nel menù `⋯` accanto all'elenco completo e al 730 — cioè fra le viste che si aprono di tanto in tanto, non ogni giorno. Non ha la striscia dei mesi, ed è il punto: non le servirebbe.

Ci vanno le due schede traslocate e sei statistiche che prima non esistevano da nessuna parte: anno per anno (con quanti mesi ha ogni anno, perché il 2024 ne ha tre e senza dirlo sembra un anno da quattromila euro), le categorie di sempre con quanto pesano in un mese medio, il mese più caro e il più leggero, quanto pesa la parte fissa mese per mese, le fisse che tornano ogni mese — cioè «quanto costa il mese base» — e le dieci botte più grandi.

Nel Riepilogo, al posto delle due schede, un rimando: **chi cercava l'andamento lo cercava lì**, e dirgli dov'è andato costa una riga.

Due convenzioni tengono insieme i numeri della pagina nuova, e sono l'opposto l'una dell'altra di proposito. Le statistiche di lungo periodo lavorano sulla serie **osservata**, senza i mesi vuoti: un mese senza spese non è «il mese più leggero» e non accorcia un anno, è un mese che non c'è. La media storica continua invece a contare i mesi vuoti, perché là un mese a zero deve abbassarla (→ ADR-0011). E il mese in corso resta fuori dai record e dalle medie, in questa pagina come nel Riepilogo.

L'interruttore delle vacanze c'è, e conta più che altrove: una settimana di viaggio sposta la media di un mese, il confronto fra due anni ancora di più (→ ADR-0010).

## Consequences

Il Riepilogo si accorcia di due schede e diventa coerente: tutto quello che contiene risponde al mese scelto.

La logica nuova sta tutta in `domain/selectors.ts` come funzioni pure — `yearlyTotals`, `extremeMonths`, `fixedShareSeries`, `recurringProfile` — con i loro test. La pagina è solo disposizione.

Due cose diventano più difficili. La prima: le statistiche ora hanno **due case**, e la domanda «dove va questo numero nuovo?» va posta ogni volta. La regola è quella che ha generato la pagina — se cambia scegliendo un mese sta nel Riepilogo, altrimenti in Statistiche — e va tenuta, perché è l'unica cosa che impedisce alla pagina nuova di diventare il cassetto delle statistiche in cui finisce tutto. La seconda: una vista in più nel menù `⋯`, che ora ne ha quattro. Alla quinta il menù diventa un problema suo.

**Il raggruppamento delle fisse per titolo è approssimato di proposito.** «Luce e gas» e «Luce e gas (inverno)» restano due voci, perché i titoli sono due. Per questo la colonna dei mesi sta in tabella: è la spia che rende visibile il raggruppamento sbagliato — una voce «fissa» comparsa una volta sola si vede a occhio.
