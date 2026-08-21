# ADR-0038: L'identità sta nel dispositivo, non nella testata

**Status:** accepted · **Date:** 2026-08-21

## Context

L'ADR-0007 aveva stabilito che non ci fosse nessun login: si scegliesse l'avatar, e l'app ricalcolasse tutto sulla quota di quella persona. Il selettore stava nella testata, valeva per ogni schermata, e la sua ragione era buona: è una **lente**, e cambiarla è come cambiare tema.

Con i due compartimenti personali (→ ADR-0037) quella lente diventa ambigua. Sul telefono di Alessio, passare su Federica vorrebbe dire aprire la sua vista — cioè il suo compartimento personale — con un tocco, accanto all'orologio. La domanda «di chi sono questi numeri?» non può avere due risposte a un tocco di distanza, in una pagina che parla di quanto puoi ancora spendere.

Alessio, scegliendo fra il tenere la lente accanto all'identità e il togliere la lente: **«solo identità, via la lente»**.

## Decision

L'avatar esce dalla testata. Di chi è questo dispositivo si dice **una volta**, in Impostazioni, e resta in `localStorage` — accanto al tema, al token GitHub e alla scelta se partire coi guadagni coperti: tutte cose che descrivono il dispositivo e non i dati.

Un telefono, una persona. Tutta l'app parla di lei: le medie, il margine, il saldo girato dal suo lato, i tricount di cui è membro.

Cambiare identità resta possibile ed è **volutamente scomodo**: è il modo per dare un'occhiata ai numeri dell'altra persona, e non deve essere un gesto che capita per sbaglio con il pollice appoggiato.

## Consequences

Sparisce un'ambiguità che era già presente prima di questo giro: le pagine dicevano «quota di Alessio» in una riga di sottotitolo che nessuno legge alla decima volta, e il numero grande del Riepilogo non diceva di chi era.

Si perde la comodità di guardare i suoi numeri in un tocco. È un gesto che Alessio faceva — è lui che aveva chiesto di poterlo fare — e ora costa quattro tocchi. Il baratto è consapevole: quel gesto ora aprirebbe un compartimento personale, e la comodità di prima non giustifica di far diventare facile quello.

`PersonButton` viene rimosso e `PersonSwitch` cambia mestiere: da lente a identità. Il codice sotto non cambia — `view.person` è ancora la persona corrente e `margine.person.v1` la stessa chiave in localStorage — ma il **significato** sì, e per questo il commento sopra il componente lo dice: chi lo rimettesse nella testata riaprirebbe la porta.

L'ADR-0007 resta accepted: la sua decisione — nessun login, nessun account, l'identità è una scelta e non una credenziale — vale tutta, ed è anche la ragione per cui questa separazione non è una garanzia (→ ADR-0039). Questo ADR sostituisce solo il paragrafo su *dove* sta il selettore e su cosa significa toccarlo.
