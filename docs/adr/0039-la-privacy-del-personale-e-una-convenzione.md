# ADR-0039: La privacy del compartimento personale è una convenzione, non una garanzia

**Status:** accepted · **Date:** 2026-08-21

## Context

Dando accesso a Federica serviva decidere che cosa significhi «il mio tricount personale è solo mio». Le due strade erano davvero due, e non è una sfumatura.

**Cifratura per persona.** Tre file: il condiviso con la passphrase che i due hanno in comune, e un personale ciascuno con la propria chiave. Nessuno dei due può leggere quello dell'altro — non per divieto, ma perché non ha la chiave. Prezzo: se una chiave si perde quei dati sono irrecuperabili; la sessione di import di un personale la può fare solo il suo proprietario; e il margine dell'altra persona diventa non calcolabile, perché entrate meno margine dà la spesa totale — e su Alessio il personale pesa il **32%** della sua quota (11.175 € su 34.726 €), quindi mostrare quel margine equivale a mostrare quel numero.

**Separazione nell'interfaccia.** Un file, una passphrase in due, e l'app che mostra a ognuno il suo. Chi ha la passphrase può leggere tutto con gli strumenti del browser, o con `npm run decrypt`.

Alessio ha scelto la seconda, dopo aver detto — ed è la premessa che la rende coerente — «non c'è niente di nascosto tra noi, a livello di ingressi».

## Decision

La separazione del compartimento personale è **una convenzione dell'interfaccia**, e va scritta come tale in tre posti: qui, negli invarianti del progetto, e nella pagina Impostazioni, dove la legge chi usa l'app.

Cosa garantisce davvero, e non è poco:

- **In scrittura, contro l'errore**: il tricount dell'altra persona non compare nei menù, quindi una spesa non può finirci per sbaglio. Non è un controllo che dice no, è un'opzione che non c'è.
- **In lettura, contro l'inciampo**: nelle medie, nei grafici, nel margine e negli elenchi il compartimento dell'altra persona non entra — e non ci entrava nemmeno prima, perché ogni statistica filtra su `shareOf(spesa, persona) > 0`.

Cosa **non** garantisce: la riservatezza. Una passphrase sola apre tutto il file. Non è una cassaforte: è la disposizione delle stanze.

E un secondo limite, che riguarda la scrittura e non la lettura: il token GitHub che serve per salvare può scrivere **qualunque** file del repo, quindi in teoria può sovrascrivere il file cifrato — distruggerlo, mai leggerlo. La storia di git recupera, e i commit dicono chi ha scritto cosa, che è la ragione per cui Federica entra nel repo **col suo account** e col suo token invece che con uno di Alessio. La garanzia vera sarebbe un repo per compartimento.

## Consequences

Il lavoro si riduce a quello che serve: un file, una chiave, l'import che resta una sessione sola, e il margine che funziona per entrambi. Niente sblocco in Impostazioni, niente pagine che degradano perché un pezzo di dato è cifrato.

Il rischio è di **credere alla cosa sbagliata**, e cresce col tempo: fra sei mesi il ricordo sarà «i personali sono separati», non «i personali sono separati nell'interfaccia». Per questo la frase sta anche a schermo, sotto l'elenco dei tricount, dove la vede chi usa l'app e non solo chi legge il repo.

Se un giorno servisse la garanzia vera, la strada è quella scartata qui — un file per compartimento, una chiave a testa — e questo ADR va sostituito, non corretto: cambierebbe la scelta, non la sua descrizione.
