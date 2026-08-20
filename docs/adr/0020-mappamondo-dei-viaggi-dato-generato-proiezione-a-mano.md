# ADR-0020: Il mappamondo dei viaggi: dato generato, proiezione a mano

**Status:** accepted · **Date:** 2026-08-20

## Context

Alessio ha chiesto un mappamondo nella pagina Vacanze, con i puntini dove sono stati e il dettaglio del viaggio toccando il puntino. Gli è stata offerta anche una mappa piatta del mondo e una dell'Europa, che basterebbe: **tutti e cinque i viaggi stanno in un raggio di duemila chilometri.** Ha scelto il globo, sapendo che oggi la faccia utile è sempre una — perché i viaggi lontani, un giorno, saranno una soddisfazione.

Da lì tre vincoli, tutti già scritti nel progetto.

Il primo: **niente richieste esterne.** I font sono self-hosted per scelta (un dato in meno che esce, una dipendenza in meno al caricamento), quindi anche i contorni delle terre devono viaggiare nel pacchetto.

Il secondo: **il pacchetto è già grasso.** 211 kB compressi, quasi tutto Recharts, e il README lo segnala come primo candidato se un giorno servisse alleggerire. Una libreria di mappe ci metterebbe sopra un altro strato.

Il terzo: le coordinate non sono nei dati, e **due dei cinque viaggi non hanno un punto.** «Germania» è un paese, «Campania e Calabria» sono due regioni: un puntino lì è una scelta, non un fatto.

## Decision

Il contorno delle terre si **genera**, non si importa a runtime. `npm run globe` legge `world-atlas` a 110m — il livello più grezzo, che per un disco da 320px basta — e scrive `src/domain/globe-land.ts`: gli anelli come coppie di gradi arrotondate a un decimale, senza laghi, senza isolotti sotto i cinque vertici. `world-atlas` e `topojson-client` restano **dipendenze di sviluppo**: nel pacchetto entra il dato, non la libreria. È lo stesso patto di `make-icon.mjs`, che genera l'icona invece di calcolarla nel browser.

La proiezione è **scritta a mano**, in `src/domain/globe.ts`: l'ortografica è la più semplice che esista — guardare la sfera da fuori — e portarsi `d3-geo` per usarne una su venti sarebbe pagare un catalogo per comprare un articolo. Trenta righe, undici test, e i gradi restano gradi fuori da quel file: i radianti non escono, così non c'è un secondo posto dove sbagliarsi di un fattore π.

Il disegno è su **tela**, non in SVG. Il contorno sono cinquemila vertici: ridisegnarli come nodi del DOM a ogni frame di trascinamento farebbe scattare il gesto. Su tela è un ciclo, e resta fluido.

Le coordinate sono un campo **facoltativo** di `Trip`, con un `approx` per i posti che non sono luoghi. Il globo disegna un cerchio intorno ai puntini approssimati e lo dice a parole, leggendo i nomi dai dati: far credere che «Germania» sia un punto sarebbe una precisione inventata. Un viaggio senza coordinate esiste come tutti gli altri e compare nell'elenco sotto.

E il globo **non è mai l'unica strada**: sotto c'è la stessa lista di viaggi come pulsanti veri. Una tela è opaca a chi non vede e non si raggiunge con la tastiera, quindi il mappamondo è un modo in più di arrivare a un viaggio, non il modo.

## Consequences

Costa **33,5 kB compressi**, di cui la maggior parte è il contorno delle terre: meno della stima di sessanta, e l'unica cosa che cresce se un giorno servisse più dettaglio. Il pacchetto passa da 211 a 245 kB.

Il dato è generato, quindi c'è un file in `src/` che **non si modifica a mano** e va rigenerato se cambia la sorgente. Il file lo dice in testa; è lo stesso rischio del `data/config.json` che duplica la tassonomia, e lì è stato mitigato con un avviso in `npm run validate`. Qui no: la sorgente è una dipendenza bloccata, non una cosa che cambia.

La proiezione fatta in casa fa una cosa sola. Il giorno che servisse una mappa piatta, una scala, uno zoom o un percorso fra due punti, `d3-geo` tornerebbe a essere la risposta giusta — e questa decisione sarebbe da rifare. Non è un debito nascosto: è il prezzo dichiarato di trenta righe al posto di trenta chilobyte.

Resta una imprecisione voluta: **tre puntini su cinque sono approssimati**, e uno di essi copre due regioni. Il globo lo dichiara invece di nasconderlo, e correggerlo è cambiare due numeri nel viaggio.
