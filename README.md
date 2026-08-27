# Margine

Cruscotto personale delle spese: legge i tricount (spese fisse condivise, personali, altre condivise, e uno per ogni vacanza) e risponde alla domanda che conta — **quanto margine ho questo mese**.

Sito statico, dati cifrati nel repo, zero servizi a pagamento. Il perché di ogni scelta sta in [`docs/adr/`](docs/adr/).

---

## Provarla in locale, adesso

⚠️ Solo su una copia appena clonata, con i dati di esempio. Se hai già i dati veri, **la seconda riga sovrascrive la tua passphrase e rende illeggibili i file cifrati**: salta al paragrafo successivo.

```bash
npm install
mkdir -p .secrets && printf 'margine-dev' > .secrets/passphrase
npm run seed      # 614 spese e 4 viaggi di esempio, verosimili ma inventati
npm run encrypt   # li cifra in public/data/
npm run dev
```

Apri `http://localhost:5173` e sblocca con **`margine-dev`**, che è la passphrase dei soli dati finti.

I dati di esempio stanno in `data-example/` e coprono venti mesi (gennaio 2025 → agosto 2026, con agosto parziale di proposito): un gatto con veterinario e crocchette, quattro viaggi, sette spese già segnate per il 730 con note e scontrini finti.

Per provarla dal telefono sulla rete di casa: `npm run dev -- --host` e apri l'indirizzo `Network` che stampa.

## Passare ai dati veri

1. **Scegli una passphrase vera** e mettila in `.secrets/passphrase` (il file è fuori da git) e nel password manager. Se la perdi insieme al Mac, i dati non tornano: vedi [ADR-0003](docs/adr/0003-dati-cifrati-nel-repo-con-passphrase.md).
2. Svuota i dati di esempio: `rm data/expenses.json`.
3. Fai il primo import seguendo [`docs/import.md`](docs/import.md), che è anche la procedura di ogni mese.
4. Compila il profilo entrate in `data/config.json` (stipendio netto, buoni pasto, mensilità aggiuntive, bonus): senza, l'app mostra le spese ma dichiara di non poter calcolare il margine.

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm run dev` | Server di sviluppo |
| `npm run build` | Typecheck e build di produzione in `dist/` |
| `npm test` | Test del dominio, della cifratura e della coda locale |
| `npm run seed` | Rigenera i dati di esempio in `data-example/` (copia in `data/` solo se è vuota) |
| `npm run from-tricount` | Converte gli export JSON in `data/raw/` in file per `data/incoming/`, e stampa le voci che nessuna regola ha categorizzato (`-- --dry-run` per non scrivere) |
| `npm run validate` | Controlla i dati in chiaro e stampa i totali per mese, da riconciliare con Tricount |
| `npm run import` | Fonde `data/incoming/*.json` nel master, valida e ripubblica cifrato. Le voci che sembrano già presenti (stesso importo, data a meno di un giorno) restano fuori e vengono elencate: `-- --doppie` le importa comunque |
| `npm run encrypt` | Cifra `data/` in `public/data/` |
| `npm run decrypt -- --yes` | Ricostruisce `data/` dai file cifrati (dopo un cambio di Mac, o per riprendere le annotazioni scritte dall'app) |
| `npm run icon` | Rigenera `public/icon-512.png` |
| `npm run globe` | Rigenera il contorno delle terre del mappamondo in `src/domain/globe-land.ts` |

## Com'è fatta

```
src/
  domain/      logica pura: modello, denaro, calendario, statistiche, margine
  data/         cifratura, coda delle annotazioni, API GitHub, stato dell'app
  components/   guscio, grafici, foglio di dettaglio
  pages/        Riepilogo · Spese · Prezzi · Esplora · Casa · Gatto · Vacanze ·
                Statistiche · 730 · Saldo · Impostazioni
  styles/       tokens.css (colori, raggi, vetro) · base.css · components.css
scripts/       seed, validazione, cifratura, import mensile
data/          master in chiaro — MAI nel repo (.gitignore)
public/data/   i due file cifrati, questi sì nel repo
```

Regole che tengono insieme il tutto (e che è meglio non rompere per distrazione):

- **Il denaro si somma solo con `domain/money.ts`**, che lavora in centesimi interi. Un `reduce((a, b) => a + b)` su importi reintroduce l'errore in virgola mobile, in silenzio. [ADR-0008](docs/adr/0008-euro-nel-file-centesimi-nei-calcoli.md)
- **Ogni categoria ha uno `slot` di colore fisso** in `config`, validato per contrasto e daltonismo. Non si riordinano le tinte a occhio. [ADR-0009](docs/adr/0009-colori-dei-grafici-slot-fisso-per-categoria.md)
- **Le vacanze stanno fuori dalle medie mensili** per impostazione predefinita. [ADR-0010](docs/adr/0010-vacanze-fuori-dalle-statistiche-mensili.md)
- **Il mese in corso si confronta con la sua proiezione**, non col parziale. [ADR-0011](docs/adr/0011-proiezione-e-confronto-del-mese-in-corso.md)
- I colori, i raggi e i font si usano **solo** attraverso i token di `styles/tokens.css`.

## Pubblicare su GitHub Pages

1. Crea il repo (per esempio `Alepazz/margine`) e fai il push del branch `main`.
2. Su GitHub: **Settings → Pages → Source: GitHub Actions**. Il workflow in `.github/workflows/deploy.yml` fa il resto a ogni push.
3. In `data/config.json`, sezione `github`, controlla `owner`, `repo`, `branch` e `dataPath`, poi `npm run encrypt` e push.
4. Il sito risponde su `https://<utente>.github.io/margine/`. Dal telefono: «Aggiungi alla schermata Home» — c'è il manifest, si apre a tutto schermo come un'app.

Nel repo finiscono **solo** i file cifrati. Il master in chiaro e la passphrase restano sul Mac.

## Scrivere dall'app

Dall'app si aggiunge una spesa col **+** al centro della barra — che nella pagina Prezzi registra invece una rilevazione, perché aggiunge la cosa della pagina in cui sei ([ADR-0044](docs/adr/0044-la-barra-serve-i-due-scopi.md)) — si corregge o si elimina dal foglio di dettaglio, si crea un viaggio, si registra un rimborso nella pagina Saldo, e si segna una spesa per il 730. Ogni modifica compare subito e viene committata nel repo in sottofondo, riscrivendo il file cifrato.

Serve un token GitHub, una volta per dispositivo, e il tipo dipende da chi lo crea.

**Se il repo è tuo** — GitHub → Settings → Developer settings → **Personal access tokens → Fine-grained tokens** → Generate new token. Repository access: **solo** questo repo. Permissions → Repository permissions → **Contents: Read and write**.

**Se vi accedi come collaboratore** — nell'elenco dei fine-grained il repo **non c'è**, e non è un errore tuo: quel tipo di token vede solo i repo del proprio account o di un'organizzazione. Serve un token **classic** con la sola spunta **`public_repo`**: il modulo sta su **`github.com/settings/tokens/new`**, che sono le impostazioni *del tuo account* — non la linguetta *Settings* del repo, dove un collaboratore trova solo «You don't have access to repository options». → [ADR-0040](docs/adr/0040-il-token-di-chi-non-possiede-il-repo.md)

In entrambi i casi il token si incolla in Margine → Impostazioni → «Scrittura nel repo», poi «Verifica la scrittura». Quel controllo prova a **scrivere** (crea un blob non referenziato, che non lascia traccia) e non a leggere: su un repo pubblico la lettura riesce senza alcun token, quindi un controllo in lettura direbbe «va tutto bene» anche con un token in sola lettura o scaduto.

Il token resta in questo browser, non entra mai nel repo. Quando scade, il salvataggio fallisce con un messaggio esplicito e le modifiche restano in coda: nulla va perso. [ADR-0005](docs/adr/0005-annotazioni-730-via-api-github.md), [ADR-0018](docs/adr/0018-l-app-scrive-le-spese-non-solo-le-annotazioni.md)

Senza token l'app funziona comunque: le modifiche restano su quel dispositivo, e il contatore nella testata dice quante sono in attesa.

## Le novità

La campanella nella testata dice cosa ha cambiato l'altra persona: una riga per spesa — «Federica ha aggiunto Aperitivo · 11,00 € · 🍔 Bar e ristoranti · Spese condivise» — e non una per salvataggio. Le legge dai **commit** che l'app stessa scrive, e il dettaglio non sta nel messaggio: il repo è pubblico, quindi titolo e importo si ricavano decifrando in locale il file a quel commit e a quello prima. Si vede solo ciò che sta nei tricount di cui sei membro; il resto non lascia traccia, né riga né numero. → [ADR-0051](docs/adr/0051-lo-storico-si-legge-dai-commit.md), [ADR-0052](docs/adr/0052-la-campanella-e-una-casella-di-posta.md)

È una casella di posta, con **due segni distinti**: chiudere il foglio — con la X, con Esc, o toccando fuori — spegne il numero sul pallino, ma l'elenco resta; a svuotarlo davvero è il pulsante in fondo al foglio. Così aprire per sbaglio non fa perdere niente, e un elenco già letto non tiene acceso il pallino per giorni. → [ADR-0061](docs/adr/0061-il-pallino-e-l-elenco-sono-due-segni.md)

In **Impostazioni → Novità** si sceglie quali gruppi di eventi contano, e spegnerli tutti non le filtra soltanto: l'app smette di chiedere del tutto. Senza token bastano le 60 richieste all'ora che GitHub concede a una rete, ma sono condivise fra i dispositivi sulla stessa wifi; quando finiscono la campanella lo dice invece di sembrare vuota. → [ADR-0054](docs/adr/0054-spente-vuol-dire-spente.md), [ADR-0053](docs/adr/0053-una-campanella-vuota-dice-perche.md)

## Note

- L'app è in italiano, compresi i commenti nel codice e la documentazione.
- Il bundle è ~245 kB compressi: quasi tutto Recharts, più ~30 kB di contorni delle terre per il mappamondo. Accettabile per un'app personale, e Recharts resta il primo candidato se un giorno servisse alleggerire.
- I font sono self-hosted: nessuna chiamata a Google Fonts.
