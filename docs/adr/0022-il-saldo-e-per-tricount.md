# ADR-0022: Il saldo è per tricount, non uno solo per la coppia

**Status:** accepted · **Date:** 2026-08-20

## Context

ADR-0019 ha introdotto il saldo fra le due persone come **un numero solo**, con un punto di partenza dichiarato in configurazione. Alla prima verifica con dei numeri veri, il modello si è rotto in due punti diversi lo stesso giorno.

Il primo. Alessio ha riferito: «leggendo il tricount e leggendo le spese, devo ricevere [cifra rimossa] da Fede». Cercando quel numero nei dati, esiste, ed esiste in un solo modo: **[cifra rimossa] è esattamente Spese Modem (2,50) + Fattura Tim (14,43)**, cioè le due voci di agosto del tricount delle spese fisse dopo l'affitto del 27 luglio. Nessuna combinazione di tricount e di date che comprenda le spese che aveva appena riportato — un sushi, una granita, un ombrellone — dà 16,93. Quel numero è il saldo di **un** tricount, non della coppia. Ed è ovvio a posteriori: **Tricount tiene un saldo per gruppo**, e quello è il numero che si legge aprendo l'app. Un totale su otto gruppi non è confrontabile con niente di ciò che si vede.

Il secondo, nella stessa frase: «la vacanza del Sud Italia è stata saldata anche se sul Tricount non figura». Ci si salda **un gruppo alla volta**. Un punto di partenza solo per tutta la coppia non sa dire «questa vacanza è pari mentre le spese di casa non lo sono»: è un'informazione che il modello non può contenere, non un dato che manca.

## Decision

Il punto di partenza è **per tricount**, in `balance.groups`: la chiave è `fisse` | `condivise` | `personali` | `vacanze/<idViaggio>`, e ogni voce ha la sua data e il suo saldo di apertura. `coupleBalance()` restituisce una riga per tricount, e il totale è la loro somma. La pagina mostra le righe: ognuna si confronta con la sua schermata su Tricount, che è l'unica verifica possibile.

Un tricount **saldato fuori da Tricount** si dichiara come punto di partenza a zero con la data del giorno. Non serve un campo nuovo sul rimborso: «pari a partire da oggi» è già esattamente quello che un punto di partenza dice, e aggiungere un `scope` al rimborso avrebbe messo due modi di rappresentare lo stesso fatto.

Un tricount che **non compare** in `groups` non ha un numero confrontabile con Tricount, e la pagina lo dichiara — nell'avviso, nella riga, e nel sottotitolo del numero grande, che diventa «totale parziale». L'alternativa era mostrare uno zero, che si legge come un fatto e non lo è.

`balance.opening` cambia significato: non è più il saldo di partenza, è il **residuo non attribuibile a nessun tricount** — contanti prestati, spese rimaste fuori da ogni gruppo — e entra nel totale **una volta sola**. La data generale `balance.since` resta come ripiego per i gruppi che non dichiarano la propria, ed è la data dell'ultimo giorno dello storico importato: tutto ciò che sta dentro l'import si considera conteggiato, e da lì in avanti il saldo è vivo.

## Consequences

I due strumenti diventano confrontabili riga per riga, che è il solo modo in cui un saldo calcolato altrove può essere creduto. In compenso il lavoro di allineamento **si moltiplica per il numero di tricount**: prima serviva un numero, ora ne servono fino a otto, e finché non ci sono la pagina dice «parziale». È il prezzo dichiarato dell'unica cosa che si può verificare.

**La trappola di questo modello ha un test dedicato**: se ogni gruppo eredita l'`opening` generale, tre tricount lo contano tre volte e il saldo triplica in silenzio. È il motivo per cui la data si eredita e il numero no — una data condivisa è innocua, un importo condiviso no.

Il rimborso registrato dall'app **non appartiene a un tricount**: è denaro che passa di mano, e sposta il totale, non un gruppo. Va bene finché i rimborsi sono pochi e generici; il giorno che servisse sapere quale gruppo ha chiuso un rimborso, quella è una decisione nuova.

Le spese personali non fanno riga: non avendo mai una quota dell'altra persona, il loro saldo è zero per costruzione. Un tricount mai dichiarato e mai mosso non compare affatto — le quattro vacanze vecchie, per esempio, semplicemente non ci sono, e l'app non afferma niente su di esse.

ADR-0019 resta **accepted**: il perché del saldo, il segno fisso, l'esclusione del welfare dal filtro e il fatto che il saldo non tocchi il margine valgono ancora tutti. Questo ADR cambia la sua granularità, non le sue ragioni.
