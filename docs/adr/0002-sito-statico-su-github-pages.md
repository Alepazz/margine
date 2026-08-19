# ADR-0002: Sito statico su GitHub Pages, senza backend

**Status:** accepted · **Date:** 2026-08-19

## Context

Vincolo dichiarato dall'utente: gratuito **a vita**, non «gratis per ora». I piani gratuiti con backend hanno tutti una scadenza travestita: Supabase mette in pausa i progetti dopo 7 giorni di inattività del database (e Margine viene usata a raffiche, non ogni giorno); Netlify è passato nel 2025-26 a un sistema a crediti molto più stretto; Firebase da febbraio 2026 richiede la carta di credito per lo storage. Un'app di statistiche personali che smette di funzionare perché è cambiata una policy commerciale non è utilizzabile.

Il fattore che rende possibile la scelta è ADR-0004: l'import delle spese avviene fuori dall'app, quindi l'app non ha bisogno di scrivere per funzionare.

## Decision

Sito **statico** su **GitHub Pages**: React + Vite compilati in file statici, dati letti come asset. Nessun server, nessun database, nessuna API propria.

Alternative scartate: Vercel Hobby e Cloudflare Pages (validi, ma non servono: non c'è un backend da ospitare — Cloudflare Pages resta il piano di riserva documentato, con repo privato e senza pause); Supabase, Netlify e Firebase per i motivi sopra.

Conseguenza tecnica: `base: './'` in Vite e **HashRouter** invece di BrowserRouter, perché su Pages non c'è un server che possa riscrivere le rotte verso `index.html`.

## Consequences

Gratuito e senza scadenze note: Pages è incluso in ogni account GitHub dal 2008, non chiede la carta, non addormenta i progetti. Il deploy è un push.

In cambio: nessuna logica lato server (accettabile, non serve), URL con `#` nel percorso (cosmetico), e limite di ~1 GB per repo — lontanissimo, dato che gli scontrini stanno su Drive (ADR-0006).

Se GitHub cambiasse le condizioni, migrare significa collegare lo stesso repo a Cloudflare Pages: l'app e i dati sono già in git, non c'è nulla da esportare.
