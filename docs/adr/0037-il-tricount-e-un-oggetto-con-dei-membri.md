# ADR-0037: Il tricount è un oggetto con dei membri, e «personale» non è un caso speciale

**Status:** accepted · **Date:** 2026-08-21

## Context

Fino a ieri un tricount era un valore di un tipo chiuso: `Source = 'fisse' | 'personali' | 'condivise' | 'vacanze'`, più una chiave composta `vacanze/<idViaggio>` per distinguere i viaggi, che tricount a sé non erano. «Personali» era **un** tricount, e nei fatti era quello di Alessio: le 370 voci in archivio sono tutte sue.

Alessio, chiedendo di dare accesso a Federica: «lei dovrebbe avere la sua vista separata, con i suoi conti separati. Ovvero il Tricount Personale dovrebbe essere solo suo, io non devo poterci inserire valori, e viceversa, così come non devo poterlo vedere. Gli altri 2 tricount così come le vacanze invece sono condivisi. **Ogni nuovo tricount deve chiedere chi sono gli utenti che vi partecipano** e le opzioni, ad oggi, sono solo me e lei».

Quella frase non chiede un secondo valore nel tipo: chiede un **campo** che oggi non esiste. E se un tricount sa chi vi partecipa, «personale» smette di essere una categoria del modello e diventa un fatto che si legge: `members.length === 1`.

Il modello vecchio aveva anche un difetto suo, indipendente da questa richiesta: due campi (`source` e `trip`) per dire una cosa sola. Ogni spostamento di una spesa doveva tenerli d'accordo a mano, e l'ADR-0018 ricorda il difetto vero che ne è nato — un `trip` rimasto attaccato a una spesa non più di vacanza, sopravvissuto a un giro in localStorage.

## Decision

```
Tricount { id, name, emoji?, members: PersonId[], closed?, trip? }
```

`dataset.tricounts` sostituisce `dataset.trips` **e** `config.sources`: identità (nome, emoji), appartenenza (membri) e viaggio (posto, date, coordinate) stanno nello stesso oggetto, perché su Tricount una vacanza è un gruppo come gli altri. `Expense.source` e `Expense.trip` collassano in `Expense.tricount`, che è l'id — **la stessa chiave** con cui il saldo raggruppa e con cui i menù scelgono, senza più prefissi da comporre e scomporre.

Da lì tre cose diventano conseguenze invece che regole a parte:

- **Le quote appartengono ai membri.** In un tricount con un membro solo la quota dell'altra persona è zero per costruzione, e la validazione lo controlla — nel browser e nell'import. La vecchia regola «una spesa personale è al 100% di chi la inserisce» era imprecisa: adesso è al 100% del **membro**, che è diverso quando è l'altra persona a guardare.
- **Il pagante resta un fatto.** Una spesa personale anticipata dall'altra persona è un debito, non un errore (→ ADR-0028); il tricount decide le quote, non chi ha tirato fuori la carta.
- **La quota di terzi e il pagante «qualcuno del gruppo» esistono solo dove c'è un viaggio**, e ora la condizione si legge dal tricount (`trip !== undefined`) invece che da un valore di enumerazione.

Il menù di inserimento offre **solo i tricount di cui chi guarda è membro**. È qui che vive la separazione in scrittura chiesta da Alessio: non è un divieto, è un'assenza — il compartimento dell'altra persona non c'è, quindi metterci una spesa per errore è impossibile.

In lettura non è servito niente, e vale la pena scriverlo: ogni statistica passa già da `shareOf(spesa, persona) > 0`, e in un tricount con un membro solo la quota dell'altra è zero. Il compartimento personale di Federica non entrava nelle medie di Alessio nemmeno prima di questo ADR.

`Trip` sopravvive come **vista di lettura** (`tripsOf(tricounts)`): appiattisce identità e viaggio in un oggetto solo, perché in trenta punti — la pagina Vacanze, il mappamondo, le statistiche dei viaggi — `trip.start` si legge meglio di `tricount.trip.start` e quei punti non hanno bisogno di sapere dei membri.

## Consequences

La migrazione (`scripts/migrate-tricounts.mjs`) tocca 1255 spese, e ha quattro guardie: **totale generale invariato al centesimo** ([cifra rimossa]), **conteggio per tricount** identico a quello per origine, **saldo identico** — totale e per gruppo, ricalcolato con la stessa aritmetica prima e dopo (−[cifra rimossa]) — e i dati migrati che passano `validate-core` senza errori. Se una non torna, non scrive.

Il perimetro è stato di venti file. Il tipo `Source`, `SOURCE_LABELS`, `SourceMap`, `LedgerKey`, `ledgerParts`, `ledgerKeyOf` e `ledgerLabel` non esistono più; `houseSource` diventa `houseTricount`; le chiavi di `balance.groups` perdono il prefisso `vacanze/`.

**La coda locale delle operazioni si azzera**, e non è una dimenticanza: passa a `margine.outbox.v3` senza convertire la v2. Le operazioni vecchie portavano `source` + `trip`, e per una spesa «personale» il compartimento di destinazione dipende da chi l'aveva scritta — cosa che la coda non sa. Chi aveva modifiche non sincronizzate al momento del passaggio le perde: sono al massimo le poche di un pomeriggio, e inventarne la destinazione sarebbe peggio.

Due cose sugli id. Quelli delle **spese** non cambiano: l'hash che li genera in `from-tricount.mjs` continua a usare il vecchio valore di `source` come token (`idToken`), congelato per sempre — cambiarlo cambierebbe l'id di ogni voce a ogni riconversione, e le annotazioni 730 perderebbero le loro spese. Quelli dei **tricount** sono leggibili (`personali-alessio`, `parigi-2025`) perché compaiono nei dati in chiaro durante la sessione mensile.

Cosa diventa più difficile: non c'è più un tipo che elenca i tricount possibili, quindi il compilatore non può più dire «questo non è un tricount». Al suo posto ci sono due controlli a runtime — `validateExpense` nel browser e `validate-core` nell'import — e un test di parità che prova che concordano. È il prezzo di un insieme che si estende dai dati, e va pagato ogni volta che si scrive codice che assume di conoscere i tricount per nome.
