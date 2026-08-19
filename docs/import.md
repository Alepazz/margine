# La sessione mensile di import

Dieci minuti, una volta al mese. Serve per portare in Margine le spese nuove dei tricount.

## Il giro, in breve

1. Prendi i dati da Tricount: export JSON dal link di condivisione, o in mancanza screenshot.
2. Export JSON → `data/raw/` e `node scripts/from-tricount.mjs`. Screenshot → lo chiedi a Claude Code.
3. I file finiscono in `data/incoming/`, tu li guardi — e guardi l'elenco delle voci senza categoria.
4. `npm run import` — fonde, valida, cifra e stampa i totali.
5. Confronti i totali con quelli di Tricount. Se quadrano, `git commit && git push`: l'app si aggiorna da sola in un minuto.

## 1. Prendere i dati da Tricount

L'export nativo non esiste più: con la versione 8.0 (riscrittura di bunq) le funzioni Premium — export CSV e PDF comprese — sono state rimosse, e `app.tricount.com` non risponde più. Le FAQ ufficiali dicono di scrivere a `support@bunq.com` per ottenere un export.

Ma il bottone non è l'unica strada. **L'API che usa l'app mobile è ancora in piedi**: la 8.0 ha spento il web app e le funzioni Premium dell'interfaccia, non il backend a cui il telefono parla. È il motivo per cui i client di terze parti continuano a funzionare — `marcomc/tricount-exporter` risulta aggiornato al 23 luglio 2026 e il client Python `tricount-api` (ricavato per reverse engineering dall'app Android) ha una release del 30 aprile 2026.

Tre strade, in ordine di preferenza:

- **Leggere l'API dal link di condivisione.** Basta la chiave del tricount (la parte dopo `https://tricount.com/`, da *Condividi → Altro*). Il payload contiene molto più di uno screenshot: data, descrizione, chi ha pagato, importo in valuta base e originale, **la quota di ogni membro con il tipo di ripartizione** (`AMOUNT` / `RATIO`) e la categoria di Tricount. Quindi le quote non si assumono 50/50: si leggono. Import preciso al centesimo, zero trascrizione, storico completo in un colpo.
- **Export ufficiale da bunq.** Scrivere a `support@bunq.com` chiedendo l'export CSV/ODF. Lento e in mano a loro, ma è la via ufficiale e prende tutto.
- **Screenshot.** Dall'app, la lista completa delle spese per ognuno dei tricount. Serve che si leggano data, descrizione, importo e chi ha pagato. Piano C, sempre disponibile.

⚠️ **Il link di condivisione è una chiave d'accesso e non si revoca.** Chiunque lo abbia può aprire il tricount e unirsi; Tricount non documenta alcun modo di rigenerarlo o invalidarlo, e il consiglio ufficiale se un estraneo vi accede è **abbandonare il tricount e crearne uno nuovo**. Conseguenza operativa: quella chiave non si incolla su un sito di terze parti (nemmeno su quelli che dichiarano di lavorare solo nel browser: il codice è loro) e non finisce mai nel repo, negli screenshot, né in un archivio di conoscenza. Si usa solo da locale, verso il server di Tricount.

## 2. Se hai gli export JSON: un comando

È la strada normale. Metti i file degli export in `data/raw/` (cartella fuori da git) e lancia:

```bash
node scripts/from-tricount.mjs --dry-run   # guarda cosa farebbe
node scripts/from-tricount.mjs            # scrive data/incoming/
```

Il convertitore legge la forma degli export di Tricount — `date`, `description`, `category`, `paid_by`, `total`, `shares` per nome — e la porta nel formato di Margine:

- i nomi dei membri diventano `me` / `partner`, e **chiunque altro finisce nella quota anonima `others`** (→ ADR-0012). I nomi con cui comparite cambiano da un tricount all'altro: stanno nelle costanti `ME` e `PARTNER` in testa allo script;
- la categoria si ricava dalla **descrizione**, non dal campo `category` di Tricount, che nel 41% delle voci è `OTHER` o `UNCATEGORIZED` (→ ADR-0013). Le regole stanno in `RULES`, la prima che combacia vince: **l'ordine è logica, non stile**;
- l'elenco dei tricount, con la loro origine e il viaggio a cui appartengono, sta in `TRICOUNTS`; i viaggi con date e luogo in `TRIPS`;
- l'id è deterministico: rilanciare la conversione sugli stessi export non crea doppioni.

Alla fine stampa **le voci che nessuna regola ha preso**, finite in `altro`. Quella lista è il lavoro del mese: per ognuna, o aggiungi una regola, o la lasci lì consapevolmente.

⚠️ Se cambi le regole e vuoi che valgano su voci **già importate**, non basta rilanciare: l'import salta gli id che già esistono. Va cancellato `data/expenses.json` e ricostruito da zero — che è sicuro solo se prima hai recuperato le annotazioni 730 scritte dall'app (vedi in fondo).

## 3. Se hai solo screenshot: lo chiedi a Claude

```
Prepara l'import di luglio 2026 per Margine. Ti passo gli screenshot dei tricount.
```

Poi allega le immagini. Il compito, che Claude conosce leggendo questo file e il `CLAUDE.md` del progetto, è:

- trascrivere ogni voce nel formato qui sotto;
- assegnare categoria e sottocategoria con le stesse regole del convertitore;
- riportare le quote come stanno su Tricount, senza assumere il 50/50: sui dati veri non lo è quasi mai al centesimo;
- segnalare le voci dubbie invece di indovinare;
- scrivere il file in `data/incoming/`.

Ogni correzione che fai su una categorizzazione va aggiunta come regola in `RULES`, così il mese dopo è già automatica.

## 4. Il formato di `data/incoming/`

Un file per mese o per tricount, per esempio `data/incoming/2026-07.json`:

```json
{
  "expenses": [
    {
      "date": "2026-07-14",
      "title": "Veterinario — vaccino annuale",
      "amount": 85.00,
      "source": "condivise",
      "category": "gatto",
      "subcategory": "veterinario",
      "paidBy": "me",
      "split": "half",
      "recurring": false
    },
    {
      "date": "2026-07-02",
      "title": "Palestra",
      "amount": 45.00,
      "source": "personali",
      "category": "tempolibero",
      "subcategory": "sport",
      "paidBy": "me",
      "split": "me",
      "recurring": true
    },
    {
      "date": "2026-07-20",
      "title": "Cena in sei",
      "amount": 180.00,
      "source": "vacanze",
      "trip": "creta-2025",
      "category": "viaggi",
      "subcategory": "cibo",
      "paidBy": "others",
      "shares": { "me": 30.00, "partner": 30.00, "others": 120.00 },
      "recurring": false
    }
  ],
  "trips": [
    {
      "id": "2026-dolomiti",
      "name": "Dolomiti",
      "place": "Dolomiti",
      "country": "Italia",
      "year": 2026,
      "start": "2026-07-04",
      "end": "2026-07-11"
    }
  ]
}
```

Campi:

| Campo | Obbligatorio | Note |
|---|---|---|
| `date` | sì | `YYYY-MM-DD` |
| `title` | sì | la descrizione come sta su Tricount |
| `amount` | sì | importo **totale** in euro, due decimali |
| `source` | sì | `fisse` · `personali` · `condivise` · `vacanze` |
| `category` | sì | un id presente in `config.categories` |
| `subcategory` | no | se la categoria ne prevede |
| `paidBy` | no (default `me`) | `me` · `partner` · `others` (uno del gruppo, in vacanza) |
| `split` | no | `half` (default per tutto tranne le personali) · `me` · `partner` |
| `shares` | no | `{ "me": 42.50, "partner": 42.50 }`, e `"others"` per la quota di chi non siete voi due. **Devono sommare esatte all'importo.** Serve ogni volta che la divisione non è una di quelle di `split` — cioè quasi sempre, sui dati veri |
| `recurring` | no (default `false`) | `true` per affitto, bollette, abbonamenti |
| `trip` | solo per `vacanze` | id del viaggio |
| `id` | no | se manca, viene calcolato da data, titolo, importo e origine: rilanciare l'import sullo stesso file non crea doppioni |
| `welfare` | no | `true` se l'ha pagata il welfare aziendale: resta nel costo della vacanza e negli elenchi, ma non erode il budget di chi l'ha anticipata (→ ADR-0014). Di norma **non si scrive qui**: si mette dall'app, come il tag 730 |

I viaggi si dichiarano una volta sola, nel mese in cui compaiono.

## 5. Fondere e cifrare

```bash
npm run import
```

Cosa fa: fonde `data/incoming/*.json` nel master (saltando le voci già presenti), valida tutto, e se è tutto in regola cifra in `public/data/`. Poi stampa il riepilogo.

La validazione blocca l'import se: un id è duplicato, una data non è valida, **le quote non sommano all'importo**, una categoria non esiste, una spesa di vacanza non ha il viaggio, un link allo scontrino non è un URL. Gli avvisi (sottocategoria non prevista, importo non positivo) non bloccano ma vanno guardati.

## 6. Riconciliare e pubblicare

`npm run import` chiude con una tabella:

```
mese      voci    totale        quota me   quota partner   quota altri
2026-07     40     [cifra rimossa]    [cifra rimossa]    [cifra rimossa]      0.00 €
```

La colonna «quota altri» compare solo se da qualche parte c'è una spesa di gruppo.

Confronta il **totale** del mese con la somma dei tricount. Se non torna, non pubblicare: cerca la differenza (di solito è una voce saltata o un importo trascritto male).

Quando torna:

```bash
git add -A && git commit -m "Import luglio 2026" && git push
```

GitHub Actions ripubblica il sito in circa un minuto.

## Se l'app ha scritto annotazioni

Tag 730, note e link agli scontrini vengono committati dall'app direttamente nel repo. Il master locale non li conosce, quindi **prima di un import fai un `git pull`**, e se il master locale è più vecchio di quello nel repo riprendilo con:

```bash
npm run decrypt -- --yes
```

Poi procedi con l'import. Salta questo passaggio e l'import successivo sovrascriverebbe le annotazioni con una versione che non le contiene.

## Regole di categorizzazione già decise

Da tenere aggiornata: è la memoria che rende l'import sempre più automatico.

La tabella completa e autorevole è `RULES` in `scripts/from-tricount.mjs`, ed è l'unico posto da modificare. Questo è il riassunto di come sono organizzate, che serve a capire **dove** intervenire:

| Blocco | Va prima di | Perché |
|---|---|---|
| casa (affitto, bollette, manutenzione, arredo, aiuto domestico) | — | i titoli sono inconfondibili |
| il gatto (crocchette, lettiera, veterinario, Arcaplanet, **Gian**, **Verdicchio**) | il cibo | «Cibo Gian» è il gatto, non la spesa |
| salute (psicologo, farmacia, visite, lenti) | — | |
| trasporti (benzina, autostrada, parcheggi, bollo, treni) | sport e cibo | «Benzina sci» è carburante |
| spesa alimentare (Gigante, Esselunga, mercato, macelleria) | ristoranti | «Spesa Gigante» non è un ristorante |
| bar e ristoranti (colazione, pranzo, cena, aperitivi, gelato) | sport e regali | «Pranzo sci» è un pranzo, «Cena compleanno» è una cena |
| tempo libero (sport, manga, videogiochi, giochi da tavolo, abbonamenti, spettacoli, fiere) | — | |
| regali | — | resta dopo il cibo, per la ragione sopra |
| tecnologia, abbigliamento, burocrazia | — | |
| nomi di locali (Ippo, Pozzo, Dina, Alto e Savio, …) | — | **ultimo blocco**: sono nomi propri, non parole, e devono cedere il passo a qualsiasi regola più precisa |

Il gatto risponde a **due nomi**, Gian e Verdicchio: entrambi stanno nelle regole del gatto. «Merenda con gatti» invece è un gattile-caffè e sta in `tempolibero`.
