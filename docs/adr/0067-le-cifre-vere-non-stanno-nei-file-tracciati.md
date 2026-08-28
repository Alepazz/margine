# ADR-0067: Le cifre vere non stanno nei file tracciati

**Status:** accepted · **Date:** 2026-08-28

## Context

Una review di sicurezza del 28 agosto 2026 ha cercato cosa il repo pubblico rivela di chi lo usa. La cifratura ha tenuto: nessun dato in chiaro, nessun token e nessuna passphrase sono mai finiti in un commit, e tutte le trentanove versioni storiche dei file cifrati sono envelope regolari. Il buco era altrove, e più in vista: **gli importi veri erano scritti in chiaro nella documentazione e nei commenti del codice.**

`CLAUDE.md` portava i due netti mensili e le due RAL. ADR-0028 conteneva il calcolo completo del netto di Federica, RAL compresa. ADR-0015 e ADR-0016 mostravano il margine di un mese vero, e l'aritmetica di ADR-0016 è precisamente la dimostrazione che sommando quattro campi visibili si ricava lo stipendio — con i numeri veri dentro. ADR-0039 dichiarava quanto pesa il compartimento personale di Alessio, in euro e in percentuale. Poi affitto, saldo fra i due, totale speso in due anni, medie delle fisse, spesa di singoli mesi — in venticinque file di documentazione e in una dozzina di commenti sparsi in `src/`.

Tre cose rendono il fatto peggiore di una svista.

**Il velo lo abbiamo costruito noi.** ADR-0016 e ADR-0066 esistono per non far comparire i guadagni sullo schermo di chi passa accanto al telefono. Gli stessi guadagni stavano in `CLAUDE.md`, leggibili da qualunque browser, senza passphrase e senza passare da nessuna schermata.

**Un dato non era nostro.** Lo stipendio di Federica e il suo obiettivo di risparmio erano pubblici, con nome e cognome, in un repo che porta anche il suo indirizzo di posta nei metadati dei commit. Su un dato altrui la soglia non la decidiamo noi.

**`git log` non dimentica.** ADR-0051 aveva già stabilito che il dettaglio di una spesa non entra in un messaggio di commit, perché il repo è pubblico per sempre. Quella regola guardava i messaggi e non si era voltata a guardare i file.

## Decision

Nessuna cifra che descriva le finanze vere di Alessio o Federica sta in un file tracciato: entrate, netti e RAL, obiettivo di risparmio, affitto e sua quota, saldo fra i due, totale storico speso, spendibile, margini e medie mensili, spesa misurata di un mese vero, costo reale di un viaggio. Vale per la documentazione, per gli ADR, per i commenti del codice e per i messaggi di commit allo stesso modo: sono tutti il repo.

Le cifre vere hanno due case, entrambe già esistenti: **`data/config.json`**, che è cifrato e che l'app sa già modificare (→ ADR-0024), e **`docs/private/`**, ignorato da git, per le note di lavoro.

Dove un ragionamento ha bisogno di numeri concreti — una tabella di calcolo, un mockup, una misura tipografica — si usano **cifre inventate, dichiarate tali**. Nei contesti tipografici l'esempio conserva il numero di cifre dell'originale, altrimenti la misura in pixel citata smette di essere vera — e regge perché il numero grande è in `--font-num`, cioè monospazio: a parità di cifre la larghezza non dipende da quali.

Il principio che rende la regola quasi gratuita: **i livelli assoluti rivelano, le differenze no.** Quasi ogni argomento di questo registro ha bisogno dello scarto e non del livello — «la media sugli ultimi dodici mesi è una cinquantina di euro più alta» dice tutto quello che ADR-0056 deve dire, e non dice quanto si guadagna.

Le alternative scartate. **Rendere privato il repo**: risolve tutto e costa GitHub Pages, cioè l'architettura intera (→ ADR-0002). **Lasciare le cifre e accettarlo**: era lo stato di fatto, e non era stato scelto — nessuno aveva deciso di pubblicare quei numeri, ci sono finiti scrivendo. **Cifrare anche la documentazione**: renderebbe illeggibile ciò che serve leggibile, e il registro degli ADR esiste per essere letto da chi arriva.

## Consequences

**Ventisei documenti — ventitré dei quali ADR — e quindici file di codice sono stati modificati.** Gli ADR sono immutabili per la convenzione di questo progetto, e questa è la ragione per cui la modifica è registrata qui invece di avvenire in silenzio: nessuna **decisione** è stata riscritta, nessuno stato, nessuna data, nessun titolo. È stato sostituito solo il **valore delle prove**. Chi legge oggi ADR-0023 trova la stessa catena di ragionamento — un saldo che combaciava, un altro fuori di ottantuno centesimi, centosessantatré spese divise a metà, ottantuno pagate da lui — con gli importi resi d'esempio e i conteggi intatti, perché i conteggi non sono denaro. Un ADR con le prove d'esempio è meno vivido dell'originale: è il prezzo, ed è pagato una volta.

**Questa regola guarda avanti, e non basta da sola.** Togliere le cifre da `HEAD` le lascia nei commit già pubblicati, dove un `git log -S` le trova ancora. Cosa fare del passato è una decisione separata, con alternative e conseguenze sue: sta in ADR-0068.

**Il posto dove cercarle non è quello che viene in mente.** La prima passata ha ripulito documentazione e commenti e ha dichiarato il lavoro finito; la review ha poi trovato **i due netti veri, attribuiti correttamente a `me` e a `partner` nella stessa espressione**, in un fixture di `src/data/outbox.test.ts`, e la quota d'affitto al centesimo come costante in `src/domain/income.test.ts`. Sono sfuggiti per una ragione precisa e generalizzabile: in prosa una cifra si scrive `1.234 €`, in un fixture si scrive `1234` — **senza separatore delle migliaia e senza simbolo**, quindi nessuna ricerca costruita sulla forma scritta la trova. Chi ripete questo lavoro cerchi anche i numeri nudi, e guardi i test: sono l'ultimo posto dove viene in mente di nascondere uno stipendio, ed è per questo che ci era rimasto.

**La regola ha un presidio debole.** Nessun test può accorgersi di una cifra vera scritta in un commento: è prosa, e il numero giusto e quello inventato hanno la stessa forma. L'unico presidio è la riga negli invarianti di `CLAUDE.md`, e la domanda da farsi scrivendo un numero in un documento: *questo l'ho misurato sui nostri dati?* Se sì, va nello scarto o va inventato.
