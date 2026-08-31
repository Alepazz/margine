# ADR-0076: Nella campanella il prezzo viene prima dell'ora

**Status:** accepted · **Date:** 2026-08-31

## Context

La campanella mostra una riga per cosa, col titolo della spesa e il suo contorno (→ ADR-0052). Il contorno era una fila di attributi grigi da 0,8rem — `12,00 € · 🍔 Bar e ristoranti · 🧾 Spese condivise` — e la colonna di destra portava l'**ora**, in mono da 0,78rem.

Alessio, guardando le notifiche di Federica: «vorrei che ci fosse proprio la spesa fatta ed il suo prezzo… ti chiederei però di dare molto più risalto al prezzo, magari mettendolo al posto dell'orario della spesa e spostando orario e giorno sotto al posto del prezzo».

Il difetto è di gerarchia, non di contenuto: l'importo c'era già, ma era la prima voce di una fila e si leggeva come uno degli attributi. «Bolletta luce» senza la cifra non dice niente — quanto sia grande è **la** cosa che si cerca aprendo una notifica — mentre l'ora era l'unico elemento con una colonna tutta sua, e a nessuno serve sapere al minuto quando l'altra persona ha premuto salva.

## Decision

Le due cose si scambiano di posto.

L'**importo** prende la colonna di destra, in cifre tabulari da 1,05rem: più grande di quanto l'ora sia mai stata, e nel corpo del numero invece che nel mono della cornice. Le righe che non sono una spesa — un prezzo rilevato, un tricount creato — non ne hanno uno, e la colonna resta vuota invece di ospitare un'altra cosa nello stesso posto: due grandezze diverse allineate allo stesso bordo si leggono come la stessa grandezza.

**Giorno e ora** scendono in testa alla riga di contorno: `Oggi · 14:32 · 🍔 Bar e ristoranti · 🧾 Spese condivise`.

Con il giorno dentro ogni riga, le **intestazioni di giorno spariscono** e l'elenco diventa piatto. Non è una perdita: questa è una casella di posta, e quello che ci sta dentro è solo ciò che non è stato svuotato (→ ADR-0052) — poche righe, non un archivio. Le intestazioni si guadagnano il posto in un elenco lungo; qui ripetevano un'informazione che ora ogni riga porta da sé.

## Consequences

Aprire la campanella risponde in un colpo d'occhio alla domanda per cui la si apre. Il prezzo dell'attenzione lo paga l'ora, che è la cosa che serviva meno.

Se un giorno le novità diventassero un archivio invece di una casella di posta, le intestazioni di giorno andrebbero rimesse — ma allora sarebbe cambiata ADR-0052, non questa.

Tre classi CSS sono state tolte perché nessuno le usava più: `.news-day` e `.news-time`, morte per questa decisione, e `.news-new`, che era già morta prima.
