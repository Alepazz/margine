# ADR-0084: La luminosità non si può alzare; la tessera è bianca e tiene lo schermo acceso

**Status:** accepted · **Date:** 2026-09-02

## Context

Alessio, il 02/09/2026, sulla tessera aperta: «quando clicco una carta si deve alzare la luminosità dello schermo in automatico (feature non obbligatoria)». È la cosa che le app di carte fedeltà native fanno, e c'è una ragione tecnica: un lettore ottico misura il contrasto fra le barre e il fondo, e uno schermo scuro in un supermercato illuminato a giorno gli rende la vita difficile.

Dal web **non si può fare, e non è un limite temporaneo**. I fatti, verificati:

- La proposta esiste dal dicembre 2020 (issue WICG #17, chiusa) e ha prodotto un explainer per `Screen.requestBrightnessIncrease()` nel repository di Screen Wake Lock.
- La prova di concetto in Chromium è **stata abbandonata** il 19/10/2022. Non c'è nessuna voce su chromestatus.
- `Screen.mozBrightness` era Firefox OS, cioè una piattaforma che non esiste più.
- Su iOS non c'è nessuna strada, nemmeno per un'app aggiunta alla schermata Home.

Nessuno la sta implementando. Va scritto perché fra sei mesi la domanda tornerà, e la risposta non è «cercare meglio».

## Decision

Al posto della luminosità, le due cose che un lettore ottico apprezza quasi quanto:

**La faccia della tessera è bianca, sempre, anche col tema scuro.** Due token nuovi in `tokens.css`, `--card-face` e `--card-face-ink`, definiti **identici nei tre stati di tema**. È l'unico posto dell'app dove un colore non segue il tema, e la ragione è che quel rettangolo non è disegnato per una persona: è disegnato per una macchina. Il commento accanto ai token lo dice, perché una futura pulizia dei temi li troverebbe «dimenticati» e li ridefinirebbe.

**Lo schermo non si spegne finché la tessera è aperta.** `useWakeLock()` in `components/ui.tsx`, accanto a `useScrollLock` — sono due ganci dello stesso genere, «tieni il telefono fermo mentre faccio questa cosa». Tre dettagli che il codice deve avere e che si sbagliano facilmente:

- **Il blocco si perde andando in secondo piano** e tornare non lo ripristina da sé. Si richiede a ogni `visibilitychange`, che è esattamente il gesto della cassa: apri la tessera, guardi altrove, torni.
- **Può non esserci**, e allora non si dice niente a nessuno. Safari ha Screen Wake Lock dal 16.4 nel browser, ma nell'app aggiunta alla Home **solo dal 18.4** (bug WebKit 254545, chiuso il 31/03/2025): prima, la richiesta falliva in silenzio. Uno schermo che si spegne dopo trenta secondi è il comportamento normale di un telefono, non un guasto da annunciare — e questa era una richiesta dichiarata non obbligatoria.
- **Il rilascio può fallire** su un blocco già perso, e quel `catch` vuoto è voluto.

La tessera aperta è una **rotta** (`/carte/:id`) e non un foglio, e la ragione è la stessa cassa: serve il gesto «indietro» del sistema, serve poterla raggiungere da un segnalibro, e serve che riaprirla dopo aver bloccato il telefono riporti dov'era. Un foglio si chiude quando l'app va in secondo piano nel modo sbagliato.

## Consequences

La richiesta non è soddisfatta come formulata, ed è giusto che resti scritto: **nessuna versione futura dell'app potrà alzare la luminosità** finché resta un sito. Se un giorno diventasse un'app nativa la cosa si aprirebbe, ma sarebbe un altro progetto.

Il sostituto copre la parte del problema che conta: su fondo bianco a piena larghezza i lettori a immagine leggono. Resta il limite dei lettori **a laser**, che alcune casse hanno e che non leggono da nessuno schermo: è lo stesso limite delle app da cui le carte arrivano, non di Margine, ed è il motivo per cui il numero sta sotto il codice in cifre grandi e tabulari — se non passa, si legge a voce.

Chi tocca `tokens.css` deve sapere che quei due valori **non sono un errore di copia**: sono identici nei tre blocchi di proposito, e renderli «coerenti col tema» romperebbe la sola cosa dell'app che deve funzionare per una macchina.
