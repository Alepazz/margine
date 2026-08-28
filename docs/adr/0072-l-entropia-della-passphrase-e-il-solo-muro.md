# ADR-0072: L'entropia della passphrase è il solo muro, e la rotazione non annulla il passato

**Status:** accepted · **Date:** 2026-08-28

## Context

L'architettura pubblica il ciphertext di proposito: sito statico su Pages, dati cifrati nel repo (→ ADR-0002, ADR-0003). È una scelta buona e ha una conseguenza che non era mai stata messa per iscritto — **l'unico attacco che conta non è tecnico, è offline.** Si scarica `expenses.json.enc`, che chiunque può prendere senza credenziali, e si prova a indovinare. Non c'è un limite di tentativi da imporre, non c'è un server che rallenti, non c'è un blocco dopo tre errori: quelle difese esistono solo dove qualcuno controlla l'accesso, e qui nessuno lo controlla.

Il costo dell'attacco, misurato invece che intuito. PBKDF2-HMAC-SHA256 a 600.000 iterazioni; i benchmark pubblici di hashcat su una GPU di fascia alta danno circa 3,5 milioni di derivazioni al secondo **a mille iterazioni**, cioè circa 3,5 miliardi di iterazioni al secondo. Diviso 600.000: **circa 5.800 tentativi al secondo per GPU.** È una stima dell'ordine di grandezza, non una misura fatta qui, e l'aritmetica è scritta perché si possa ricontrollare.

Da cui, con mille GPU noleggiate:

| Se l'entropia vera è | 1 GPU | 1.000 GPU |
|---|---|---|
| 40 bit (una frase memorizzabile) | 3 anni | **1 giorno** |
| 50 bit | 3.100 anni | 3 anni |
| 60 bit | 3,2 milioni di anni | 3.200 anni |
| 80 bit | 3,3·10¹² anni | 3,3·10⁹ anni |

La riga che conta è la prima. Una passphrase **lunga** non è una passphrase **forte**: «la casa di Federica in via del mare» ha trentasei caratteri e forse quaranta bit, e cade in un giorno. Cinque parole scelte a sorte da un dizionario di 7.776 ne hanno sessantacinque, e reggono.

La passphrase in uso è stata ispezionata senza leggerne il valore: ventidue caratteri, tutte e quattro le classi (minuscole, maiuscole, cifre, simboli), diciannove caratteri distinti, nessuno spazio né separatore. È la firma di una stringa **generata**, non di una frase composta a mente. L'ispezione però non può dire *come* è nata, e la differenza fra le due righe estreme della tabella sta tutta lì: **l'ha confermato Alessio, il 28 agosto 2026 — è generata, e conservata in un posto sicuro.** Quindi sta nell'ultima riga, e non c'è niente da cambiare.

Vale la pena che sia scritto, perché è il genere di cosa che fra sei mesi si ricorda come «mi pare fosse a posto»: la verifica strutturale è ripetibile in ogni momento, la conferma di chi l'ha generata no.

## Decision

Si registra che **l'entropia della passphrase è il solo controllo portante dell'intero progetto**, e che va generata a caso — da un gestore di password o da cinque parole estratte a sorte — mai composta perché sia memorabile. Nessun altro accorgimento la sostituisce: le 600.000 iterazioni moltiplicano il costo di ogni tentativo, non riducono il numero di tentativi necessari.

Si registra anche il corollario che non è ovvio: **cambiare la passphrase non annulla l'esposizione.** Le versioni cifrate già pubblicate restano nella storia pubblica, decifrabili con la passphrase vecchia per sempre, e ognuna contiene quasi tutto il dataset perché ogni salvataggio riscrive il file intero (→ ADR-0018). Una rotazione che significhi qualcosa richiede anche una riscrittura della storia, come quella di ADR-0068 — altrimenti protegge solo i dati futuri.

Scartato un controllo automatico di robustezza in `publish()`. Un test strutturale — lunghezza, classi di caratteri — accetterebbe `Password1234567890!` e rifiuterebbe cinque parole minuscole separate da spazi, cioè si sbaglierebbe nei due versi proprio sui casi che contano; e un controllo che dà una risposta sbagliata su ciò che deve giudicare è peggio di nessun controllo, perché produce fiducia. La verifica vera — «questa stringa è nata da un generatore?» — non si fa guardando la stringa.

## Consequences

**Non c'è niente da presidiare nel codice**, e questo ADR è l'unico posto dove la cosa è scritta. È il suo scopo: la domanda «ma quanto è sicura, in pratica?» tornerà, e la risposta è una tabella con dentro l'aritmetica invece di un'impressione.

**Il limite di 600.000 iterazioni non si abbassa mai**, e ora non si può: ADR-0073 mette un pavimento nei controlli dell'envelope. Senza quello, l'entropia della passphrase non conterebbe niente — un file scritto con `iterations: 1` renderebbe forzabile in tempo zero anche una passphrase da ottanta bit.

**Chi cambia la passphrase deve ricifrare tutto e avvisare l'altra persona**, perché la coda in `localStorage` e il file nel repo devono restare d'accordo: una passphrase nuova con un file vecchio si presenta come «passphrase errata», che è il messaggio giusto ma non spiega perché.

**Il rovescio di una passphrase generata è che non c'è nessun recupero.** AES-256-GCM non ha una porta di servizio, non esiste una copia della chiave da nessuna parte, e il file cifrato senza la passphrase è rumore — è esattamente la proprietà per cui il repo può stare pubblico. Perderla vuol dire perdere due anni di dati, in modo definitivo. Una copia sola, dentro un gestore di password, è a un blocco dell'account di distanza dalla perdita totale: la domanda da farsi non è «l'ho salvata?» ma «in quanti posti indipendenti?».
