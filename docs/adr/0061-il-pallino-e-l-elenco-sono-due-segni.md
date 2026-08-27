# ADR-0061: Il pallino e l'elenco sono due segni diversi

**Status:** accepted · **Date:** 2026-08-27 · Precisa ADR-0052

## Context

ADR-0052 ha deciso che la campanella è una casella di posta: dentro c'è solo ciò che non è stato svuotato, e a svuotarla è un pulsante. Aprire il foglio **non** dichiara letto, perché quando lo faceva la campanella si azzerava mentre la si guardava.

All'uso resta scomodo, e Alessio l'ha detto: «le notifiche sulla campanellina devono scomparire anche se premo la x del modale». Poi, subito dopo, la precisazione che cambia tutto: «occhio che la x non deve svuotare, deve solo togliere il numerino sulla campanellina, fine».

È la distinzione giusta, e mancava. Con **un segno solo** «l'ho guardato» e «l'ho archiviato» erano per forza lo stesso gesto, e si poteva scegliere solo quale sacrificare: o si perdevano le novità aprendo per sbaglio (com'era prima di ADR-0052), o il pallino restava acceso su righe già lette (com'era dopo).

## Decision

**Due segni.**

`seenAt` è dove si è **svuotato**: l'elenco mostra ciò che viene dopo, e a spostarlo è il pulsante nel piede.

`readAt` è dove si è **guardato**: il pallino conta ciò che viene dopo, e a spostarlo è la chiusura del foglio.

Svuotare li muove tutti e due, perché ciò che non c'è più non può essere da leggere. Guardare muove solo il secondo.

Passano per la chiusura **tutti e tre i gesti** — la X, `Esc`, il tocco fuori — perché sono tre modi di fare la stessa cosa, e uno che si comportasse diversamente somiglierebbe a un difetto invece che a una scelta.

Il conteggio del pallino sta nel dominio, `unseenCount(notices, readAt)`, e parte dalle **stesse righe** che il foglio mostra: la lezione di ADR-0052 — elenco e conteggio nascono nello stesso posto, o prima o poi il pallino mente — regge, solo che il pallino non è più la *lunghezza* dell'elenco ma quante ne restano oltre il segno di lettura.

Tutti e due i segni si spostano con la stessa cautela di ADR-0052, in una funzione sola: si ancorano alla novità **più recente che si ha davvero in mano**, mai all'ora corrente, e non tornano mai indietro. Senza novità in mano non si dichiara niente — la campanella è tappabile appena l'app è pronta, e un segno piantato su «adesso» nei ~350 ms in cui l'elenco sta ancora arrivando cancella novità che nessuno ha visto.

## Consequences

Aprire per sbaglio non costa più niente: il pallino si spegne, ma il foglio riaperto ha ancora tutto. E un elenco già letto non tiene acceso il pallino per giorni.

Il pulsante «Svuota notifiche» smette di essere l'unico gesto e diventa quello **esplicito**, l'unico che perde qualcosa — che è la definizione giusta di un pulsante che sta in un piede.

Il prezzo è una chiave in più in `localStorage` (`margine.news.readAt.v1`) e un invariante nuovo: `readAt` non è mai più indietro di `seenAt`, perché svuotare li muove entrambi. Nessun tipo lo garantisce; lo garantisce il fatto che c'è un solo posto che li scrive.

Verificato sul banco, ed è la tabella che descrive la decisione meglio di qualunque frase:

| gesto | pallino | elenco |
|---|---|---|
| all'apertura | 4 | 4 righe |
| chiudo con la X | spento | 4 righe, restano |
| premo «Svuota notifiche» | spento | 0 |
