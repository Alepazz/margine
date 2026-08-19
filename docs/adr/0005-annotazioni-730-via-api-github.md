# ADR-0005: Le annotazioni 730 si scrivono via API GitHub, con coda locale a due stadi

**Status:** accepted · **Date:** 2026-08-19

## Context

Marcare una spesa come «da scaricare nel 730», scriverci una nota e collegare uno scontrino sono gesti che si fanno *quando si ha voglia e tempo*: la sera, dal telefono, non durante la sessione mensile. Sono l'unica cosa che l'app deve poter scrivere.

Un backend per tre campi contraddirebbe ADR-0002. Tenere le annotazioni solo nel browser le renderebbe invisibili dagli altri dispositivi e le farebbe perdere al cambio di telefono.

## Decision

L'app committa direttamente nel repo tramite l'**API GitHub**, chiamabile dal browser senza server intermedio: legge il file cifrato, lo decifra in memoria, applica le patch, ricifra e fa un `PUT` con lo `sha` letto (concorrenza ottimistica: al conflitto rilegge e rifonde una volta). Serve un token fine-grained con `Contents: read and write` sul solo repo, salvato in `localStorage` — per dispositivo, mai nel repo.

Le annotazioni passano da una **coda locale a due stadi** (`src/data/outbox.ts`):

- `pending` — non ancora committate (offline, token scaduto, errore). Vengono riapplicate al caricamento, così non si perdono.
- `settled` — già committate, ma GitHub Pages può metterci un minuto a ripubblicare. Finché il file servito è quello vecchio, queste annotazioni vanno riapplicate, altrimenti sembrerebbero sparite. Si eliminano da sole quando il dato scaricato le contiene già.

## Consequences

Si annota dal telefono, in qualsiasi momento, e il dato finisce nel repo versionato: ogni modifica è un commit con la sua storia. Nessun servizio in mezzo.

In cambio: un token da creare e rinnovare (~una volta l'anno, con avviso nell'app quando il salvataggio fallisce), e un pezzo di logica non banale — la coda a due stadi esiste solo per il ritardo di pubblicazione di Pages, e chi la togliesse credendola inutile riporterebbe il bug «ho taggato e sembra sparito».

Il secondo stadio ha una scadenza di 14 giorni: oltre, si assume che quella modifica sia andata perduta piuttosto che tenerla in volo per sempre.
