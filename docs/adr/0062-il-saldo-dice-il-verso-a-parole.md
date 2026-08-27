# ADR-0062: Il saldo dice il verso a parole, e il pulsante appare a chi paga

**Status:** accepted · **Date:** 2026-08-27 · Supera due scelte di ADR-0060

## Context

ADR-0060 aveva deciso due cose che all'uso si sono rivelate sbagliate, e le ha smentite lo stesso gesto: Alessio che apre l'app in produzione, sul suo telefono.

La prima: **il segno da solo come verso**. «`+` verde vuol dire che rientrano soldi, `−` rosso che ne escono» è vero, ma è una convenzione che bisogna già avere in testa. Chi guarda `+[cifra rimossa]` non legge «devo ricevere»: legge un numero verde. La frase «te li deve» era stata tolta perché stava dentro un riquadro e si leggeva come un fumetto appiccicato al numero grande (→ ADR-0059) — ma il problema era il riquadro, non la frase. «Manca una scritta come "Devi ricevere" oppure "Devi dare" che aiuta a capire.»

La seconda: **il pulsante nei due versi**. Era stato chiesto esplicitamente, con la domanda posta e la risposta scelta fra due — «in tutti e due i versi», come nella pagina Saldo. Vedendolo in uso la risposta è cambiata: «vedo il bottone per saldare ma in realtà io devo ricevere, non dare, quindi il bottone non dovrebbe apparire a me».

Ha ragione, e il motivo è nel verbo. **Saldare è un gesto che si compie pagando.** Offrirlo a chi deve incassare gli chiede di dichiarare un pagamento che non ha fatto lui. Nella pagina Saldo l'ambiguità non c'è perché sotto al pulsante una riga dice «il rimborso va da Federica ad Alessio»; nella testata del Riepilogo quella riga non c'è, e il pulsante resta da solo accanto a un `+[cifra rimossa]`.

Il calcolo, verificato prima di toccare l'interfaccia, era giusto: `+[cifra rimossa]` sui dati veri, cioè Alessio in credito, cifra verde. Non c'era nessun difetto nel segno.

## Decision

**Il verso si dice a parole**: «Devi ricevere», «Devi dare», «Siete in pari», sotto la cifra, nello stesso stile del suggerimento che sta sotto il numero grande — così le due metà hanno entrambe una riga piccola che spiega il proprio numero. Il segno e il colore restano, e ora rinforzano una frase invece di sostituirla.

**Il pulsante appare a chi deve pagare**, e a nessun altro. Sul telefono di chi è in debito c'è, su quello di chi è in credito no.

È una regola migliore di quella che sostituisce, e non solo perché è quella chiesta: rende **chi paga anche chi registra**. Il rimborso lo dichiara la persona che l'ha fatto, nel momento in cui lo fa, dal telefono che ha in mano.

La terza riga della metà destra sta in un contenitore suo, perché la riga della griglia è **una sola**: le due metà devono avere lo stesso numero di righe o `subgrid` non le allinea più (→ ADR-0060).

## Consequences

Quando è l'altra persona a pagarti, il rimborso non lo registri più con un tocco dal Riepilogo. Lo registra lei dal suo telefono — dove il pulsante c'è — oppure tu dalla pagina Saldo, che offre tutti e due i versi e ha la riga che dice da chi a chi. È il prezzo accettato, ed è piccolo perché chi paga ha già l'app aperta per guardare quanto deve.

Resta il rischio che nessuno dei due registri: prima almeno chi incassava poteva farlo al volo. Se dovesse succedere, il segnale è che il saldo non scende mai — ed è visibile ogni giorno in cima al Riepilogo, che è il posto giusto perché un fatto dimenticato si faccia notare.

Cade la parte di ADR-0060 che diceva «il segno è il messaggio». Non era falsa: era una convenzione che chiedeva di essere già nota, e questa è la terza volta oggi che una scelta di presentazione regge al ragionamento e non all'uso. La lezione, per quel che vale: sulle etichette il banco non decide niente, decide il telefono di chi legge.
