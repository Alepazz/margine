/**
 * Il mazzo delle carte fedeltà: due colonne di tessere, come un portafoglio.
 *
 * Non usa `usePageData` di proposito, come la pagina Prezzi e per la stessa
 * ragione: quel gancio filtra le spese per la persona scelta, e qui non c'è
 * niente da filtrare — la carta del supermercato è di casa. → ADR-0082, ADR-0041
 *
 * **La griglia è di sole facce.** Nome e tipo di codice sotto ogni tessera
 * c'erano, e li ha tolti Alessio guardando le sue carte vere: «occupano solo
 * spazio quelle due righe». Le facce sono le insegne, e un'insegna si riconosce
 * prima di leggerla. Il nome entra **dentro** la faccia solo quando la faccia
 * non c'è — una tessera senza immagine è un rettangolo di colore, e un
 * rettangolo di colore da solo non dice di chi è. Per chi legge con la voce il
 * collegamento porta nome e tipo di codice in `aria-label`. → ADR-0086
 */

import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { CardSheet } from '../components/CardSheet'
import { Card, Notice, Segmented } from '../components/ui'
import { useReadyStore } from '../data/store'
import { readLastUsed } from '../data/card-use'
import {
  FORMAT_LABEL,
  ORDER_LABEL,
  hasBarcode,
  inkOn,
  sortCards,
  type CardOrder,
} from '../domain/cards'
import type { LoyaltyCard } from '../domain/types'

/**
 * La faccia di una tessera: l'immagine se c'è, altrimenti la tinta col nome.
 *
 * Il nome compare **solo** senza immagine. Con l'immagine è l'insegna a dirlo,
 * e scriverlo sopra coprirebbe proprio il logo; senza, il rettangolo di colore
 * ha bisogno di una parola. Senza tinta la faccia è neutra e usa l'inchiostro
 * del tema — un ripiego «chiaro» scriverebbe bianco su una superficie chiara.
 */
function CardFace({ card }: { card: LoyaltyCard }): ReactNode {
  if (card.image !== undefined) {
    return (
      <span className="card-face">
        {/* `alt` vuoto: il nome lo porta l'`aria-label` del collegamento, e
            ripeterlo farebbe leggere due volte la stessa cosa a chi usa la voce. */}
        <img src={card.image} alt="" />
      </span>
    )
  }
  return (
    <span
      className={
        card.color === undefined ? 'card-face is-plain' : `card-face is-ink-${inkOn(card.color)}`
      }
      style={card.color !== undefined ? { background: card.color } : undefined}
    >
      <span className="card-face-name">{card.name}</span>
    </span>
  )
}

export function Carte(): ReactNode {
  const { cards, config } = useReadyStore()
  const [order, setOrder] = useState<CardOrder>('recenti')
  const [adding, setAdding] = useState(false)
  /*
   * Letto una volta all'apertura della pagina e non a ogni disegno: l'ordine
   * non deve muoversi sotto il dito mentre si guarda l'elenco. Tornando dalla
   * tessera la pagina si rimonta, e allora la carta appena usata sale.
   */
  const [lastUsed] = useState(readLastUsed)

  const shown = useMemo(() => sortCards(cards, order, lastUsed), [cards, order, lastUsed])
  /*
   * Senza `github.cardsPath` una carta **non si può salvare**, quindi non si
   * può nemmeno cominciare: i pulsanti spariscono e resta la frase che dice
   * cosa manca. Prima la condizione si calcolava e serviva **solo** all'avviso,
   * mentre i pulsanti restavano attivi: la carta entrava in coda, compariva a
   * schermo come salvata, e non partiva mai. → ADR-0082
   */
  const readOnly = config.github !== null && !config.github.cardsPath

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1>💳 Carte</h1>
          <p className="page-sub">
            {cards.length === 0
              ? 'Le tessere fedeltà, da mostrare alla cassa'
              : `${cards.length} ${cards.length === 1 ? 'carta' : 'carte'} fedeltà`}
          </p>
        </div>
        {cards.length > 1 ? (
          <Segmented
            options={(['recenti', 'nome'] as const).map((value) => ({
              value,
              label: ORDER_LABEL[value],
            }))}
            value={order}
            ariaLabel="Come ordinare le carte"
            onChange={setOrder}
          />
        ) : null}
      </div>

      <div className="stack">
        {readOnly ? (
          <Notice tone="warn">
            In <code>config.json</code> manca <code>github.cardsPath</code>: le carte si vedono ma
            non si possono aggiungere né correggere da qui.
          </Notice>
        ) : null}

        {cards.length === 0 ? (
          <Card>
            <p className="empty">
              Ancora nessuna carta. Aggiungi le tessere che porti al supermercato: alla cassa si
              apre questa pagina invece di cercare il portafoglio.
              <br />
              Serve il numero stampato sotto le barre e il tipo di codice — e una foto della
              tessera, se ce l’hai.
            </p>
            {readOnly ? null : (
              <div className="card-foot" style={{ textAlign: 'center' }}>
                <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                  Aggiungi una carta
                </button>
              </div>
            )}
          </Card>
        ) : (
          <>
            <div className="card-grid">
              {shown.map((card) => (
                <Link
                  className="card-tile"
                  to={`/carte/${card.id}`}
                  key={card.id}
                  aria-label={`${card.name}, ${hasBarcode(card) ? FORMAT_LABEL[card.format] : 'solo numero'}`}
                >
                  <CardFace card={card} />
                </Link>
              ))}
            </div>

            {readOnly ? null : (
              <div className="row" style={{ justifyContent: 'center' }}>
                <button type="button" className="btn" onClick={() => setAdding(true)}>
                  Aggiungi una carta
                </button>
              </div>
            )}

            <Card>
              <p className="hint">
                Le carte non sono spese: non entrano nel margine, nel saldo né nelle statistiche. E
                non sono di nessuno dei due — qui vedete lo stesso mazzo.
              </p>
            </Card>
          </>
        )}
      </div>

      {adding ? <CardSheet onClose={() => setAdding(false)} /> : null}
    </>
  )
}
