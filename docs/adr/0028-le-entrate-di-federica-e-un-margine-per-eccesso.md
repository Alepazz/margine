# ADR-0028: Le entrate di Federica sono registrate, e il suo margine è dichiarato per eccesso

**Status:** accepted · **Date:** 2026-08-20

## Context

Alessio: «sappi che Fede guadagna [cifra rimossa] ad oggi», e poi «obiettivo di risparmio di lei 200».

Finora `income.partner` era `null`: l'app mostrava le spese di Federica — la sua quota di tutto ciò che è condiviso — e per il margine diceva «entrate non impostate». Con la RAL c'è tutto quello che serve per riempirlo.

C'è però un fatto nei dati che rende quel margine diverso da quello di Alessio, e non di poco. Le **370 spese personali** in archivio sono tutte di Alessio: Federica non ha mai esportato il suo tricount personale, e non c'è motivo di pensare che non spenda niente per sé. Quindi le sue uscite tracciate sono soltanto le sue quote di ciò che è condiviso, mentre le sue entrate sarebbero complete: entrate intere contro uscite parziali fa un margine più largo del vero, e non di un margine di errore — di tutta la sua spesa personale.

Le due opzioni erano: lasciare `null`, e allora il numero non c'è; oppure riempirlo e **dichiarare** che è per eccesso.

## Decision

Il profilo si riempie, con il netto **stimato** dalla RAL di [cifra rimossa] calcolato con lo stesso metodo che riproduce esattamente i [cifra rimossa] di Alessio: contributi INPS 9,19%, IRPEF a tre aliquote, detrazione da lavoro dipendente, addizionali al 2% → circa [cifra rimossa] netti l'anno, su 13 mensilità (tredicesima confermata) → **[cifra rimossa] al mese**. Obiettivo di risparmio 200 €, come riferito.

Il campo `note` del profilo dice tre cose: che il netto è una stima e da dove viene, chi ha riferito i numeri e quando, e che **le spese personali di Federica non sono nei dati, quindi il suo margine è per eccesso**. La nota compare nella scheda del profilo entrate, cioè accanto al numero.

La nota si **cancella da sé** se qualcuno modifica il netto dall'app: una nota che dice «stimato dalla RAL» sopra un numero preso dalla busta paga sarebbe una bugia, e una bugia in una nota è peggio di nessuna nota.

## Consequences

Guardando l'app come Federica il margine c'è, con scritto perché è ottimista. È preferibile a «entrate non impostate», che non è più vero, e all'alternativa silenziosa, che mostrerebbe un numero rassicurante senza dire che manca metà del conto.

La strada per farlo diventare vero è nota e non serve codice nuovo: importare il tricount personale di Federica. Quel giorno la nota va riscritta, e sarà un fatto e non una stima.

Il netto resta una **stima** anche per lei, come per lui. Il metodo è verificabile — riproduce i [cifra rimossa] al centesimo — ma non conosce detrazioni, comune di residenza né fondo pensione. Ora che le entrate si modificano dall'app (→ ADR-0024) correggerlo è questione di trenta secondi dal telefono, il giorno che una busta paga vera è sotto mano.

Vale ancora la limitazione di ADR-0016: coprire i guadagni copre anche i suoi.
