# ADR-0065: Un mese che non è ancora cominciato non si confronta con niente

**Status:** accepted · **Date:** 2026-08-27 · Estende ADR-0063

## Context

ADR-0063 ha insegnato al Riepilogo che un mese futuro non è un mese chiuso: il numero grande e la scheda della proiezione lo dicono. Restava aperta una domanda, posta ad Alessio insieme a quella correzione — la scheda «Confronti» su settembre 2026 confrontava zero con zero e scriveva «nei primi 0 giorni: 0 €». Risposta: «secondo me vale la pena nascondere».

Guardando dove finiva quella stessa frase, però, la scheda non era sola. Sul mese futuro il Riepilogo diceva anche «−100 % sulla media» sotto «Speso nel mese» e sotto «Spese variabili», e la tabella «Sopra o sotto la tua media» elencava categorie con uno scostamento pari all'intera media. Ognuna di quelle è la stessa affermazione in un vestito diverso, ed è vera nel modo in cui è vera «non ho speso niente in un mese in cui non ho ancora vissuto»: aritmeticamente corretta, e priva di significato.

Nascondere solo la scheda avrebbe lasciato tre copie del difetto sulla stessa pagina, da riscoprire una alla volta.

## Decision

Su un mese futuro il Riepilogo non mostra **niente che confronti**: via la scheda «Confronti», via le due etichette di scostamento sotto le statistiche, e «Sopra o sotto la tua media» dice che non c'è niente da confrontare.

Le due forme sono diverse di proposito. «Confronti» è una scheda a tutta larghezza e sparisce del tutto: dove stava non resta un buco. «Sopra o sotto la tua media» divide una griglia a due colonne con la torta delle categorie, e togliere una delle due lascerebbe l'altra da sola in una griglia per due — quindi la scheda resta, con dentro la riga che spiega il vuoto, esattamente come già fa quando la storia è troppo corta per confrontare.

Ciò che il mese futuro può già contenere **resta visibile**: le voci, il loro totale, la torta, le voci più pesanti. È il principio di ADR-0055 — un dato sbagliato si scopre guardandolo, non nascondendolo. Sparisce il commento su quel dato, non il dato.

## Consequences

La regola è una e copre i quattro posti, quindi un quinto confronto aggiunto domani al Riepilogo dovrà chiedersi se vale su un mese futuro. Il flag si chiama `futureMonth` e sta accanto a `inProgress`, che è dove uno guarda.

Il compilatore non aiuta, per la stessa ragione di ADR-0063: `projection.method === 'futuro'` è un confronto che resta valido comunque lo si dimentichi. È il motivo per cui i quattro posti stanno scritti qui.

Il caso è raro per costruzione — un mese futuro esiste solo se una voce ha una data sbagliata, o se qualcuno registra in anticipo — e questo è un argomento a favore, non contro: è precisamente quando succede che nessuno ha in testa il contesto per accorgersi che «−100 % sulla media» non vuol dire niente.
