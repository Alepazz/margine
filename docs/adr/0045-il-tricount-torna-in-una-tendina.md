# ADR-0045: Il tricount torna in una tendina

**Status:** accepted · **Date:** 2026-08-22

## Context

ADR-0044 ha sostituito la tendina del tricount, nel modulo di inserimento di una spesa, con una fila di spunte. Il ragionamento era che il tricount è il campo da cui dipende tutto il resto del modulo, quindi anche quello il cui errore costa più caro, e che una tendina tiene le alternative dietro un tocco mentre i chip le mostrano tutte.

Provato sull'app vera, il conto non torna. Il difetto lo si vedeva già durante l'implementazione — coi cinque viaggi aperti di oggi la fila arrivava a otto chip su **cinque righe**, e ADR-0044 l'aveva mitigato raccogliendo le vacanze sotto un chip espandibile — ma la mitigazione ha spostato il problema senza risolverlo: anche collassata, la fila occupa **tre righe** dove la tendina ne occupa una, e quelle due righe in più stanno **prima** di «Cos'era» e «Quanto», cioè prima dei due campi che si scrivono a ogni singola spesa. Si paga altezza su ogni inserimento per mostrare alternative che, in una spesa, non si scelgono: il tricount è quasi sempre quello proposto, e quando non lo è cambiarlo da una tendina costa un tocco in più di un chip — una volta ogni tanto, non ogni volta.

C'è anche un argomento di coerenza, che da solo non avrebbe deciso ma pesa: la tendina è già il controllo del tricount in tre altri posti (il filtro della pagina Spese, il pannello «Sposta di tricount» nel foglio di dettaglio, e la scelta dentro `LedgerSelect` stesso). Avere due controlli diversi per lo stesso campo è una cosa da imparare due volte.

Alternative valutate:

- **Tenere i chip e accorciarli** (senza emoji, senza anno sulle vacanze): risparmia una riga e ne perde due di leggibilità — «Lisbona» e «Lofoten» distinti dall'anno sono già al limite.
- **Chip solo per i tricount piani, tendina per le vacanze**: due controlli nello stesso campo, che è peggio di uno solo mediocre.

## Decision

Il selettore torna a essere `LedgerSelect` — la tendina di prima, col pulsante «Nuova vacanza» accanto — identico a com'era prima di ADR-0044. Le classi `.choice-row` / `.choice-chip` sono state rimosse insieme al loro unico consumatore, e con esse lo stato che apriva le vacanze.

Questo ADR **rovescia solo la scelta del selettore**. Tutto il resto di ADR-0044 resta in vigore e non è in discussione: la barra che serve i due scopi, il `+` che aggiunge la cosa della pagina in cui sei, «Esplora» come pagina con le anteprime invece di un menù, e la catena del modulo dei prezzi.

## Consequences

Il modulo torna com'era, quindi non c'è niente da imparare per chi lo usava — ed è la ragione per cui il rovesciamento costa poco: la fila di chip è vissuta un giorno e non è mai arrivata sui telefoni (il commit del restyle non era ancora stato pubblicato).

Resta a verbale una cosa che vale più della decisione: **un controllo che mostra tutte le alternative non è più ergonomico per il fatto di mostrarle.** Lo è se le alternative si scelgono spesso. Qui il costo — due righe prima dei campi che si scrivono sempre — lo paga ogni inserimento, mentre il beneficio lo incassa solo l'inserimento in cui il tricount va cambiato. Il ragionamento di ADR-0044 aveva pesato bene il rischio (una spesa nel tricount sbagliato) e male la frequenza. La misura che l'avrebbe smentito prima esisteva già, ed era sotto gli occhi: «Cos'era» cominciava a 211px dall'inizio del corpo del foglio, contro i 163 di adesso — quarantotto pixel su ogni inserimento, per un'informazione che serve a uno su venti.

Le due difese contro il rischio che ADR-0044 voleva coprire restano dove erano e bastano: la tendina **mostra sempre il tricount corrente** (→ ADR-0027, ed è il motivo per cui contiene anche i tricount conclusi quando sono quello della spesa che si corregge) e offre **solo i propri** (→ ADR-0037).
