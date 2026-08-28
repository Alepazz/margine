# ADR-0012: Una terza quota anonima per le spese di gruppo

**Status:** accepted · **Date:** 2026-08-19

## Context

L'ADR-0007 ha fissato `shares: { me, partner }`, due quote che sommano esattamente all'importo. Regge finché si spende in due.

Non regge sui dati veri. Due dei cinque tricount di vacanza hanno altre persone dentro: la Germania del 2024 con due parenti, Creta 2025 con quattro amici. Sono 51 voci su 1253, e in ognuna una parte del conto non era nostra. Una cena da 180,00 € divisa in sei — 30,00 suoi, 30,00 di Federica, il resto degli altri — non è rappresentabile con due quote, e la validazione la rifiuta perché 60,00 ≠ 180,00. (Le cifre di questa cena sono inventate: → ADR-0067.)

Tre modi di uscirne. **Ridurre l'importo alla sola parte nostra** (60,00 €): il modello non cambia, ma l'app non sa più che quella cena è costata 180 € e i totali non riconciliano più con Tricount — che è l'unico controllo che abbiamo sulla correttezza di un import. **Lasciare che le quote sommino a meno dell'importo**: indebolisce l'invariante che ha già intercettato errori veri, per un caso che è il 4% dei dati. **Aggiungere un terzo secchio.**

Su cosa serve sapere, la richiesta è stata esplicita: interessano la spesa propria, quella di Federica e il totale del viaggio — sia del gruppo che diviso nelle tre parti. Non interessa chi c'era né come si dividevano tra loro.

## Decision

`shares` diventa `{ me, partner, others? }`, e l'invariante si estende: **me + partner + others = amount**, sempre, garantito dalla validazione.

`others` è un totale **anonimo**: non teniamo i nomi né le quote individuali dei terzi. Per la stessa ragione `paidBy` ammette un terzo valore `'others'` — in Germania e a Creta ha anticipato il conto uno del gruppo trenta volte, e scrivere «pagata da Alessio» sarebbe falso.

Il campo è opzionale e assente in tutte le spese in cui non serve, cioè 1202 su 1253. Fuori dalle vacanze la validazione lo segnala con un avviso: una quota di terzi nella spesa di casa è quasi certamente un errore di conversione.

Ne segue una regola di presentazione: **«quanto abbiamo speso» è sempre `me + partner`, mai `amount`.** I selettori la incarnano in `coupleShare` / `totalCouple`, e `totalAmount` resta il fatturato con cui si riconcilia Tricount. Le due cifre coincidono ovunque tranne nei viaggi di gruppo, ed è lì che l'etichetta deve dire quale delle due sta mostrando.

## Consequences

I numeri restano veri su entrambi i piani: nel dettaglio di Creta si legge quanto ha speso il gruppo, quanto è costato a noi due e quanto era di altri. La riconciliazione con Tricount continua a funzionare al centesimo, perché `amount` è rimasto l'importo fatturato.

Il prezzo è un invariante con un termine in più, quindi un modo in più di sbagliare: chi aggiunge un selettore che somma `amount` per dire «quanto abbiamo speso» introduce un errore silenzioso che si vede solo nei mesi con una vacanza di gruppo. È il motivo per cui `coupleShare` esiste come funzione invece di essere scritta a mano ogni volta.

Restano fuori due cose, per scelta: quanto ha speso ciascuno degli altri, e i saldi verso di loro — chi deve quanto a chi. Per quelli c'è Tricount, che è dove serve saperlo.
