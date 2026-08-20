# ADR-0025: Più file in un commit solo, con la Git Data API

**Status:** accepted · **Date:** 2026-08-20

## Context

L'app scriveva nel repo con la **Contents API** di GitHub (`PUT /repos/{owner}/{repo}/contents/{path}`), che accetta un percorso per chiamata. Con un file solo da scrivere — le spese — funzionava senza riserve, e il campo `sha` dava anche il rilevamento dei conflitti: se un altro dispositivo aveva committato nel frattempo, la scrittura veniva rifiutata e l'app rileggeva e riprovava.

Da quando anche la configurazione è scrivibile (→ ADR-0024) esiste un'operazione che cambia **due file insieme**, e non per comodità: cancellare una categoria toglie una voce da `config.json.enc` e riscrive le trenta spese che la usavano in `expenses.json.enc`. Con due chiamate sono due commit, e fra il primo e il secondo il repo è incoerente con sé stesso. GitHub Pages ripubblica in fretta ma non a comando: chi apre l'app in quella finestra vede spese che puntano a una categoria che non esiste — o, se l'ordine è l'altro, una categoria dichiarata vuota che ha ancora le sue spese dentro.

Non è un caso di scuola: la finestra si allarga quanto il secondo `PUT`, e se il secondo `PUT` **falla** — token scaduto, rete che cade — l'incoerenza resta nel repo finché qualcuno non se ne accorge.

## Decision

Tutte le scritture passano da una funzione sola, `commitFiles`, che usa la **Git Data API**: crea un blob per ogni file, un tree che li innesta sul commit corrente, un commit con quel tree, e sposta il ref del branch. Quattro chiamate in più, e un commit unico che contiene tutti i file cambiati.

Il rilevamento dei conflitti resta identico da fuori: l'aggiornamento del ref si fa con `force: false`, quindi se un altro dispositivo ha committato nel frattempo il nostro commit non è più un avanzamento del suo padre e GitHub risponde 422 — lo stesso codice che dava lo `sha` sbagliato nella Contents API, e lo stesso ramo di codice lo gestisce: rileggi, riapplica, riprova.

`putFile` viene **rimossa**. Due strade per scrivere nel repo sarebbero due comportamenti da tenere allineati, e quello usato una volta al mese è quello che si rompe senza che nessuno lo veda.

La configurazione si rilegge e si riscrive **solo se un'operazione in coda la tocca**. Non è un'ottimizzazione: ogni cifratura usa un IV nuovo, quindi riscrivere la configurazione per abitudine produrrebbe un file diverso a ogni salvataggio anche senza modifiche — un diff in ogni commit, su un file che nessuno ha cambiato.

## Consequences

Un'operazione che tocca dati e configurazione è atomica: nel repo non esiste un istante in cui i due si contraddicono. Vale anche per il futuro — qualunque altro file cifrato si aggiunga entra nello stesso commit senza codice nuovo.

Il costo è quattro richieste HTTP invece di una, su un salvataggio che parte in sottofondo dopo 1,2 secondi di attesa: non è un percorso in cui la latenza si veda. E il token richiede sempre lo stesso permesso, `Contents: read and write`, che copre anche la Git Data API — nessun cambio di configurazione per chi già ce l'ha.

Resta un limite dichiarato: l'atomicità è **per salvataggio**, non per sessione. Se la coda contiene dieci operazioni e il commit riesce, ci sono tutte; se ci sono due salvataggi separati, sono due commit. Va bene, perché ogni salvataggio parte da uno stato coerente e ne produce uno coerente.
