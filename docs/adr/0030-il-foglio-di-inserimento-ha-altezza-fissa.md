# ADR-0030: Il foglio di inserimento ha altezza fissa

**Status:** accepted · **Date:** 2026-08-20

## Context

Alessio, provando il modulo dal telefono: «attualmente il menù che si apre non è fisso nello spazio e quindi si sposta dentro la sua finestra e non va bene».

Il foglio era ancorato in basso (`align-items: flex-end`) con altezza libera fino a `max-height: 90dvh` e `overflow-y: auto` su tutto il foglio. Da quella combinazione escono due comportamenti, entrambi descritti da quella frase.

Sotto i 90dvh il foglio **cresce col contenuto**, e visto che è ancorato in basso cresce verso l'alto: scegliere una vacanza fa comparire il selettore del viaggio, scegliere «a mano» fa comparire tre campi di quota, e ogni volta tutto quello che stavi guardando salta di posizione mentre il dito è a mezz'aria. Sopra i 90dvh accade il contrario: l'altezza si blocca e scorre l'intero foglio, titolo compreso, quindi il pulsante «Aggiungi» finisce fuori vista e perdi il riferimento di dove sei.

Il modulo nuovo ha più campi del vecchio, quindi entrambi i regimi si attraversano nella stessa sessione.

## Decision

Il foglio di inserimento — e **solo** quello, marcato `.sheet.is-form` — ha **altezza fissa**: `90dvh` sul telefono, `min(86dvh, 720px)` su schermo grande. Dentro, tre parti: la testa ferma, il corpo che scorre (`.sheet-body`, con `min-height: 0` perché altrimenti un figlio flex non scende sotto la propria altezza naturale e a scorrere finisce la pagina), e il piede fermo con «Aggiungi» e «Annulla» sempre visibili.

Il foglio di **dettaglio** resta ad altezza variabile: lì il contenuto non cambia mentre lo guardi, e un foglio alto quanto lo schermo per mostrare quattro righe sarebbe sproporzionato.

## Consequences

Niente si sposta più mentre si compila, in nessuno dei due regimi, e il pulsante che salva non va mai cercato. È anche la forma dei moduli nativi — quello di Tricount che Alessio ha mandato come riferimento è a tutto schermo — quindi il gesto è quello che si aspetta.

Il prezzo è che un modulo con pochi campi mostra dello spazio vuoto in fondo. È il compromesso giusto in questo verso: lo spazio vuoto è brutto, un campo che si sposta sotto il dito fa sbagliare l'inserimento.

`.sheet` diventa un contenitore flex e lo scorrimento si sposta dal foglio al corpo. Vale per tutti e due i fogli, quindi un foglio nuovo che dimenticasse `.sheet-body` non scorrerebbe affatto: è un difetto visibile al primo sguardo, non silenzioso, e per questo va bene così.
