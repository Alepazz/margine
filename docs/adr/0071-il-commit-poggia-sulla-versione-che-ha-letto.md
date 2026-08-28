# ADR-0071: Il commit poggia sulla versione che ha letto

**Status:** accepted · **Date:** 2026-08-28

## Context

Il flush leggeva il file cifrato con `?ref=<branch>`, che GitHub risolve alla testa **del momento della lettura** — chiamiamola H1. Poi `commitFiles` si rileggeva il ref da sé (`GET /git/ref/heads/<branch>`) e usava quella testa — H2 — come `base_tree` e come genitore del commit.

Se fra i due momenti l'altra persona ha committato, l'albero costruito su H1 diventa figlio di H2, e nel farlo **sostituisce** il file che H2 aveva cambiato. Il `PATCH` con `force: false` è a tutti gli effetti un avanzamento del ref, quindi **GitHub non protesta**: nessun 422, nessun tentativo di unione, le spese dell'altra persona svanite in silenzio.

`getFile` restituisce anche lo `sha` del file letto, e nel flush **non veniva mai usato** — solo `.text`. Era proprio quel confronto a proteggere la vecchia Contents API dallo stesso caso, e ADR-0025, passando alla Git Data API per avere un commit solo, ha perso l'equivalente senza che nessuno lo notasse.

La finestra è breve — la lettura, la decifratura, la cifratura — e questo è il motivo per cui il difetto non si è mai visto: due persone che salvano nello stesso secondo sono rare. «Rare» però non è «impossibili», e la conseguenza è la perdita di un dato senza nessun segno.

## Decision

La testa si risolve **una volta**, prima di leggere: `headSha(cfg, token)`. I file si leggono a quella versione esatta (`?ref=<sha>`), e la **stessa** versione va a `commitFiles` come genitore.

`commitFiles` non se la risolve più da sé, e il parametro `parent` è **obbligatorio**: un valore di ripiego riaprirebbe la finestra in silenzio, a chi se ne fosse dimenticato. Il compilatore ha colto l'unico chiamante nel momento in cui il campo è diventato obbligatorio, che è il presidio giusto per un invariante di questo tipo.

L'alternativa scartata era confrontare lo `sha` del file letto con quello al momento del commit, cioè rifare a mano ciò che la Contents API faceva. Costa una chiamata in più e protegge un file alla volta, mentre qui i file sono due e devono muoversi insieme (→ ADR-0025): la versione del **repo** è la cosa giusta da fissare, non quella dei singoli file.

## Consequences

**Un commit interposto diventa un 422**, che è esattamente ciò che il tentativo già esistente sa gestire: rilegge tutto da capo — testa nuova, file nuovi, coda riapplicata — e riprova una volta. Il conflitto non è più silenzioso: o vince o si vede.

**Una chiamata in più per flush**, il `GET /git/ref`. Prima la faceva `commitFiles`, quindi il conto non cambia quando si scrive; cambia solo perché ora viene prima.

**La lettura del flush non passa più dal branch**, quindi legge una versione che potrebbe non essere più la testa quando il commit parte. È voluto: è la stessa versione su cui il commit dichiara di poggiare, e la discordanza la rileva GitHub invece di ingoiarla.

**Non c'è un test**, per la stessa ragione di ADR-0070: servirebbe un `fetch` finto che intercali un commit fra la lettura e la scrittura. Il presidio è il tipo — `parent` obbligatorio — che è più forte di un test, perché non si può dimenticare.
