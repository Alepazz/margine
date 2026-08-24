# ADR-0048: L'isola non è fissa, e il guscio non scorre

**Status:** accepted · **Date:** 2026-08-24

## Context

La barra in fondo continuava a spostarsi sul telefono anche dopo ADR-0047: «a volte vola in mezzo allo schermo». Alessio ha portato il paragone giusto — su Whiff e su Epilog la barra sta ferma — e il paragone spiega perché qui non stava: **la barra di Whiff è una vista nativa** (Expo Router, `(tabs)/_layout.tsx`), cioè non è dentro la pagina e non c'è nessun viewport che la possa muovere. Non esiste una riga di CSS da copiare da là.

Il problema è che `position: fixed` ancora un elemento al **viewport**, e sul telefono il viewport si muove per ragioni che la pagina non controlla: il rimbalzo di fine corsa lo trascina, la comparsa della tastiera lo rimpicciolisce, e lo scorrimento automatico verso il campo che prende il fuoco lo sposta. ADR-0047 ha coperto la prima delle tre con `overscroll-behavior`, e le altre due sono rimaste — è la ragione per cui quella decisione era giusta come diagnosi parziale e insufficiente come rimedio. Nessuna delle tre si governa dal CSS, quindi ogni tentativo di correggere il `bottom` inseguirebbe un bersaglio mobile.

C'è anche un difetto di contorno che nasceva dalla stessa scelta: essendo l'isola sopra il contenuto, la pagina doveva riservarsi in fondo il suo ingombro esatto, e quell'ingombro andava **misurato** a runtime con un `ResizeObserver` che pubblicava `--tabbar-h` (ADR precedente). Un secondo meccanismo da tenere d'accordo col primo.

## Decision

L'app diventa un **guscio che non scorre**, con lo scorrimento in un elemento interno:

- `html, body` hanno `height: 100%` e `overflow: hidden` — il documento non scorre e non rimbalza.
- `.app` è alto `100dvh` (non `100vh`: su iOS `vh` è il viewport grande, e il guscio finirebbe sotto il bordo dello schermo), è una **colonna** su telefono e torna una riga sopra i 900px.
- `.content` è **l'unica cosa che scorre**, con `overscroll-behavior: contain`.
- `.tabbar` non è più `fixed`: è l'ultima riga del guscio. Sta in fondo perché in fondo è il suo posto nel flusso, e la safe-area passa dal `bottom` a un `margin-bottom`.

Ne conseguono due semplificazioni che valgono da sole: `--tabbar-h`, `--tabbar-reserve` e il `ResizeObserver` che li alimentava **sparIscono** — non c'è più niente da riservare, perché l'isola non copre niente; e il blocco della pagina dietro un foglio aperto diventa una classe su `<html>` che toglie lo scorrimento a `.content` (`useScrollLock`, con un contatore per i fogli che si sostituiscono a vicenda), invece del solito trucco del `body` reso fisso con il ripristino a mano dello `scrollY` — che è il modo in cui di solito si perde il segno riaprendo un elenco lungo.

Alternative valutate:

- **Insistere su `position: fixed` e inseguire il viewport in JavaScript** (`visualViewport`, riposizionamento a ogni evento): copre tutte e tre le cause ma con un ascoltatore su ogni scorrimento e un tremolio suo, per tenere ferma una cosa che nel flusso sarebbe ferma gratis.
- **Barra incollata al bordo, senza isola**: tolto il distacco dal fondo, il difetto resterebbe identico — non è l'aspetto dell'isola a muoverla, è `fixed`.

## Consequences

La barra non può più muoversi, e non «perché adesso il CSS è giusto»: perché non c'è più nessun ancoraggio da sbagliare. Verificato in WebKit a 390 e 320px — `position: static`, 14px dal fondo, centrata al pixel, e **zero** spostamento scorrendo il contenuto fino in fondo — e su 1280px, dove l'isola non c'è e il guscio torna una riga con la colonna alta quanto la finestra.

Il prezzo, dichiarato perché è visibile: **il contenuto non scivola più sotto il vetro dell'isola.** Prima si intravedeva la pagina passare sotto la barra translucida; ora la pagina finisce sopra di lei e il vetro sfuma la carta. Nello stesso baratto rientra la griglia del quaderno, che sta su `body`: adesso è un fondale fermo mentre il contenuto le scorre davanti, invece di muoversi con lui.

Il rischio nuovo è che con un guscio ad altezza fissa **ogni contenitore intermedio deve dichiarare `min-height: 0`**, altrimenti un figlio flex non scende sotto la propria altezza naturale e a scorrere finisce il guscio invece del contenuto: è la stessa famiglia di ADR-0033 e ADR-0046, e i tre posti che lo dichiarano sono `.main`, `.content` e `.sheet-body`.

Questa decisione **rovescia ADR-0047**: `overscroll-behavior-y: none` su `html, body` non serve più, perché un documento che non scorre non rimbalza, e la proprietà si è spostata dov'è ancora utile — sul riquadro che scorre davvero.
