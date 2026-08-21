# ADR-0033: La larghezza del foglio non la decide il suo contenuto

**Status:** accepted · **Date:** 2026-08-21

## Context

L'ADR-0030 ha fermato il foglio di inserimento in verticale: altezza fissa, testa e piede immobili, solo il corpo che scorre. Restava un movimento **laterale**, e Alessio l'ha trovato subito: «quando si apre il menù per aggiungere una voce di spesa, il menù si muove lateralmente e non è più fisso».

Misurato: scegliendo un tricount di vacanza compare il terzo pagante, «Qualcuno del gruppo». I tre pulsanti in fila chiedono 377px dove ce ne sono 356, e il foglio passa da 370 a 390px di larghezza scivolando da `left: 10` a `left: 0` — cioè mangiandosi i suoi margini laterali. I 21px che restano fuori diventano scorrimento orizzontale dentro il corpo.

La causa non è il pulsante: è che **il foglio è un elemento flex**, e un elemento flex ha `min-width: auto`, quindi non scende sotto la larghezza minima di ciò che contiene. Il `width: 100%` che ha addosso non vince: per la dimensione minima, una percentuale non conta.

Una guardia c'era già e misurava la cosa sbagliata. `Segmented` passa alla variante stretta con i puntini **da quattro voci in su**, e il commento nel CSS dichiarava «non sborda mai dal contenitore, qualunque siano le etichette». Ma quello che non ci sta è la somma delle etichette, non il loro numero: tre voci di cui una lunga diciannove caratteri sbordano, quattro corte no.

## Decision

Due righe di CSS, e sono due decisioni diverse.

**`min-width: 0` sul foglio** è l'invariante: la larghezza del foglio la decide il foglio. Qualunque cosa gli finisca dentro in futuro — una tabella, un nome lunghissimo, un controllo nuovo — potrà sbordare per conto suo, ma non potrà più spostare la finestra sotto il dito di chi sta scrivendo.

**`flex-wrap: wrap` sul controllo segmentato** è la cura del contenuto: la fila di paganti va a capo invece di sfondare, e la voce rimasta sola riempie la sua riga (`flex: 1 1 auto` cresce solo quando c'è spazio da spartire, cioè solo quando è andata a capo). Si preferisce l'andare a capo ai puntini di sospensione della variante stretta: costa una riga in un foglio che scorre già, e l'etichetta si legge per intero.

Verificato sul banco in otto stati del modulo (vuoto, vacanza, a mano, vacanza a mano, categoria nuova, con sottocategorie, personale, correzione) a 390px e a 320px: `left` sempre 10, larghezza sempre 370 (o 300), scorrimento orizzontale sempre zero.

## Consequences

Il difetto non può più tornare per la stessa strada: qualsiasi contenuto largo, da qui in avanti, produce al massimo uno scorrimento dentro il corpo — brutto ma innocuo — e non un foglio che si sposta.

Non c'è un test automatico che lo presidi, e non è una dimenticanza: qui non ci sono jsdom né Testing Library (i test sono su logica pura), e una regola CSS si misura solo in un browser vero. La garanzia sta nella misura registrata qui sopra e nel commento accanto alle due righe, che dicono perché esistono. **Chi le trova e le crede rumore, le toglie e rimette il difetto.**

La lezione che vale oltre questo caso: **una guardia deve misurare la grandezza che rompe.** Contare le voci di un controllo per indovinare se ci stanno è misurare un indizio, non la cosa; e un indizio ha sempre un contresempio, che arriva il giorno in cui aggiungi un'etichetta più lunga.
