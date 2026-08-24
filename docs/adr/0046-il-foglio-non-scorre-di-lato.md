# ADR-0046: Il foglio non scorre di lato, e l'anello del fuoco ha il suo spazio

**Status:** accepted · **Date:** 2026-08-24

## Context

Due difetti segnalati insieme sul telefono, nel modulo di inserimento di una spesa e in «Registra un prezzo»: il contenuto del foglio **si trascina di lato** sotto il pollice invece di stare fermo, e toccando un campo di testo — «Cos'era» — l'anello bianco del fuoco **non chiude intorno al campo**, si vedono la riga sopra e quella sotto e niente ai lati.

Hanno la stessa origine, e sta in due righe di CSS che non la dichiaravano. `.sheet-body` aveva `overflow-y: auto` e l'altra direzione lasciata a `visible`: la regola di CSS Overflow è che `visible` accanto a un valore di scorrimento **si calcola come `auto`**, quindi il corpo del foglio era un contenitore scorrevole anche in orizzontale — misurato, `overflow-x` calcolato rispondeva `auto`. E i campi stanno a `width: 100%`, cioè larghi esattamente quanto il riquadro di clip di quel contenitore, mentre l'anello di `:focus-visible` cresce 4px oltre il bordo (2px di spessore a 2px di distanza): i suoi lati cadevano **fuori** dal riquadro e venivano tagliati.

Il difetto non si riproduce sul banco. Misurato in Chromium **e in WebKit**, a 430, 390, 375 e 320px di larghezza, su tutti gli otto tricount, in divisione automatica e a mano, col modulo della vacanza nuova aperto: nessun elemento sborda di un pixel e `scrollLeft` non si muove. Su iOS invece il trascinamento c'è, e la spiegazione che regge è che a chiedere lo spostamento non sia il dito ma il sistema: iOS porta in vista l'elemento che prende il fuoco, e ciò che deve rivelare include l'anello che sporge dal clip. Non è una certezza, ed è scritto qui perché non lo diventi per sbaglio.

## Decision

`.sheet-body` dichiara `overflow-x: hidden` e si prende **6px** di spazio orizzontale per l'anello, resi con un `margin-inline: -6px` di pari misura perché il bordo dei campi resti allineato a testa e piede del foglio.

`hidden` e non `clip`: accanto a un `auto` sull'altro asse la stessa regola di prima trasforma `clip` in `hidden`, quindi scriverlo non aggiungerebbe niente — verificato leggendo il valore calcolato in WebKit, che risponde `hidden` a una dichiarazione `clip`. Il dito non trascina più; un `scrollLeft` resta possibile, ed è la ragione per cui i 6px sono la metà che conta di questa decisione, non un margine estetico.

Alternative valutate:

- **Anello all'interno del campo** (`outline-offset: -2px` sui campi dentro il foglio): risolve il taglio senza toccare il contenitore, ma lascia il foglio scorrevole di lato e rende l'anello meno visibile proprio dove serve, sul bordo di un campo che ha già un bordo.
- **Nessun `width: 100%` sui campi, larghezza a `calc(100% - 8px)`**: la stessa cosa detta in ogni campo invece che una volta nel contenitore, e da riscrivere a ogni campo nuovo.

## Consequences

I due fogli con un corpo scorrevole — inserimento di una spesa e registrazione di un prezzo — smettono di muoversi di lato e mostrano l'anello intero: verificato in WebKit a 390 e 320px, 2px di margine su entrambi i lati e `scrollLeft` inchiodato a zero. Gli altri due fogli (dettaglio di una spesa, storico di un prezzo) non hanno un `.sheet-body` e non erano interessati.

Il prezzo è che ora un elemento troppo largo viene **tagliato in silenzio** invece di rendere il foglio scorrevole. È il baratto giusto — un modulo che scivola sotto il dito è peggio di un bordo tagliato — ma sposta il lavoro sulla misura: qui la protezione non è il browser che si lamenta, è misurare quanto sborda, come già in ADR-0033 e ADR-0044.

Resta a verbale la regola generale: **un contenitore che scorre in una direzione scorre in tutte e due**, se l'altra non la dichiari, e clippa gli anelli del fuoco di ciò che contiene a piena larghezza. Vale per ogni `overflow-y: auto` che nascerà da qui in avanti — `.scroll-pane` compreso, che su telefono torna a `overflow: visible` e per questo non ha mai mostrato il difetto.
