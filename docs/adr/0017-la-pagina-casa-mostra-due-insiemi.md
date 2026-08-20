# ADR-0017: La pagina Casa mostra due insiemi, non uno

**Status:** accepted · **Date:** 2026-08-20

## Context

Alessio ha chiesto «una sezione interamente dedicata alla casa, quindi al Tricount Spese Casa», dando per equivalenti due cose che nei dati non lo sono.

Il tricount «Spese Casa» è il `source` che l'import chiama `fisse`. Sui dati veri contiene 93 voci, e dentro c'è anche quello che casa non è:

```
telefonia            40      ← non è casa
casa/bollette        22
casa/affitto         20
trasporti/auto        5      ← non è casa
casa/manutenzione     3
casa/arredo           1
trasporti/parcheggi   1      ← non è casa
altro                 1
```

E la categoria `casa` conta 104 voci, di cui **58 stanno in un altro tricount** — «Perché non sono ric(c)a», quello delle spese condivise varie: prodotti, arredo, qualche manutenzione comprata insieme alla spesa.

Quindi mostrare solo il tricount lascia fuori 58 spese di casa vere; mostrare solo la categoria lascia fuori 40 voci di telefonia che nel tricount ci stanno e che uno si aspetta di trovare; fonderli dichiara che la telefonia è casa e conta due volte le 46 voci nell'intersezione.

## Decision

La pagina mostra **due sezioni distinte, con due nomi diversi**.

La prima è il tricount così com'è, `source === houseSource`. La ciambella è per **categoria**, non per sottocategoria, così telefonia e assicurazione auto si vedono per quello che sono invece di essere travestite da casa; e la scheda lo dice a parole, invece di lasciarlo scoprire.

La seconda è `category === houseCategory && source !== houseSource`: le spese di casa registrate altrove. Lì sono tutte della stessa categoria, quindi la ciambella distingue le sottocategorie e usa una rampa a un colore — una famiglia sola.

I due riferimenti stanno in `config` come `houseSource` e `houseCategory`, sulla convenzione già in piedi di `catCategory` e `tripCategory`, e in `scripts/lib/taxonomy.mjs` come sorgente unica per il seed.

L'intersezione è vuota per costruzione: il secondo insieme esclude il primo per `source`. Un test lo verifica invece di fidarsi della lettura.

## Consequences

Il totale di «casa» non torna per difetto né per eccesso, e chi guarda la pagina vede anche la parte scomoda: che il tricount delle fisse è un contenitore storico, non una tassonomia.

Il costo è che la pagina è più lunga e chiede al lettore di capire perché ci sono due elenchi. La nota in fondo a ogni sezione spiega il perché, ma resta una complessità che nasce dai dati e non dal disegno.

E c'è una semplificazione che sembrerà ovvia fra sei mesi: unire i due insiemi in un `houseExpenses` unico. Chi la facesse conterebbe due volte le 46 voci che stanno in entrambi i criteri, e la pagina mostrerebbe un totale gonfiato senza che niente si rompa in modo visibile. È il motivo per cui questa decisione è scritta.
