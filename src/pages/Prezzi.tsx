/**
 * L'osservatorio dei prezzi: quanto costa quella cosa, e dove costava meno.
 *
 * Serve a una domanda che si fa in piedi davanti a uno scaffale, quindi la
 * pagina è fatta per essere letta in due secondi: un prodotto per scheda, i
 * supermercati dal più conveniente, il migliore evidenziato e gli altri con
 * quanto costano in più.
 *
 * Non usa `usePageData` di proposito. Quel gancio filtra le spese per la persona
 * scelta, e qui **non c'è niente da filtrare**: un prezzo a scaffale non è di
 * nessuno dei due, è un fatto. → ADR-0041
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { Card, DeltaLabel, Notice, useScrollLock, useToast } from '../components/ui'
import { PriceSheet } from '../components/PriceSheet'
import { useReadyStore } from '../data/store'
import { formatDate } from '../domain/dates'
import { formatEuro } from '../domain/money'
import { filterBoard, priceBoard, UNIT_LABEL, type PriceRow } from '../domain/prices'
import { nameKey } from '../domain/text'

/** Quale riga è aperta nel foglio: il gruppo e il supermercato. */
interface Opened {
  groupKey: string
  store: string
}

/**
 * Lo storico di un prodotto in un supermercato, con la cancellazione di una
 * rilevazione alla volta.
 *
 * Si cancella e si rifà invece di modificare: una rilevazione è quanto costava
 * quel giorno, non un valore che evolve. Correggerla in punta sarebbe riscrivere
 * il passato. → ADR-0041
 */
function HistorySheet({
  product,
  unit,
  row,
  onDelete,
  onClose,
}: {
  product: string
  unit: keyof typeof UNIT_LABEL
  row: PriceRow
  onDelete: (priceId: string) => void
  onClose: () => void
}): ReactNode {
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  useScrollLock()

  useEffect(() => {
    sheetRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="sheet-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Storico di ${product} · ${row.store}`}
        tabIndex={-1}
        ref={sheetRef}
      >
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: '1.15rem' }}>{product}</h2>
            <p className="card-note">
              {row.store} · {UNIT_LABEL[unit]} · {row.history.length}{' '}
              {row.history.length === 1 ? 'rilevazione' : 'rilevazioni'}
            </p>
          </div>
          <button type="button" className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Chiudi">
            ✕
          </button>
        </div>

        <div className="list">
          {row.history.map((entry) => (
            <div className="list-row is-static" key={entry.id}>
              <span className="list-main">
                <span className="list-title">{formatEuro(entry.price)}</span>
                <span className="list-meta">
                  <span>{formatDate(entry.date)}</span>
                  {entry.note ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{entry.note}</span>
                    </>
                  ) : null}
                </span>
              </span>
              <span className="list-amount">
                {confirming === entry.id ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        onDelete(entry.id)
                        setConfirming(null)
                      }}
                    >
                      Sì, elimina
                    </button>{' '}
                    <button type="button" className="btn btn-sm" onClick={() => setConfirming(null)}>
                      Annulla
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setConfirming(entry.id)}
                    aria-label={`Elimina la rilevazione del ${formatDate(entry.date)}`}
                  >
                    Elimina
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>

        <div className="card-foot">
          Una rilevazione sbagliata si elimina e si rifà: è il prezzo di quel giorno, non un valore
          da correggere.
        </div>
      </div>
    </div>
  )
}

export function Prezzi(): ReactNode {
  const { dataset, deletePrice } = useReadyStore()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [opened, setOpened] = useState<Opened | null>(null)

  const board = useMemo(() => priceBoard(dataset.prices), [dataset.prices])
  const shown = useMemo(() => filterBoard(board, query), [board, query])

  /*
   * La riga aperta si rilegge dal tabellone a ogni render invece di essere
   * copiata nello stato: appena si elimina una rilevazione lo storico cambia, e
   * il foglio deve dire la verità di adesso. Quando l'ultima rilevazione di quel
   * supermercato sparisce, la riga non c'è più e il foglio si chiude da sé.
   */
  const openedGroup = opened ? board.find((group) => group.key === opened.groupKey) : undefined
  /* Per nome normalizzato e non per stringa: la grafia mostrata è quella della
     rilevazione più recente, quindi cancellandola può cambiare — e un confronto
     esatto farebbe chiudere il foglio da sé, cosa che sembrerebbe un guasto. */
  const openedRow = openedGroup?.rows.find(
    (row) => opened !== null && nameKey(row.store) === nameKey(opened.store),
  )

  const stores = new Set(dataset.prices.map((entry) => entry.store.trim())).size

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          {/* U+FE0F obbligatorio: senza, l'etichetta è un glifo di testo e viene
              disegnata come un rettangolo pallido. */}
          <h1>🏷️ Prezzi</h1>
          <p className="page-sub">
            {board.length === 0
              ? 'Quanto costa, e dove costa meno'
              : `${board.length} ${board.length === 1 ? 'prodotto' : 'prodotti'} · ${stores} ${
                  stores === 1 ? 'supermercato' : 'supermercati'
                } · ${dataset.prices.length} rilevazioni`}
          </p>
        </div>
      </div>

      <div className="stack">
        {/* La ricerca resta anche a modulo aperto: il foglio sta sopra, e
            chiudendolo si torna all'elenco dov'era. */}
        <div className="filters">
          <input
            className="input input-search"
            type="search"
            inputMode="search"
            placeholder="Cerca un prodotto o un supermercato"
            aria-label="Cerca fra i prezzi"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            Registra un prezzo
          </button>
        </div>

        {board.length === 0 ? (
          <Card>
            <p className="empty">
              Ancora nessun prezzo. Registra quello che vedi a scaffale — passata, caffè, latte — e
              quando torni a fare la spesa questa pagina ti dice quanto costava altrove.
              <br />
              Basta un prezzo per prodotto per cominciare: il confronto arriva col secondo
              supermercato.
            </p>
          </Card>
        ) : shown.length === 0 ? (
          <Notice>
            Nessun prodotto e nessun supermercato corrisponde a «{query.trim()}».
          </Notice>
        ) : (
          shown.map((group) => (
            <Card
              key={group.key}
              title={group.product}
              note={`${UNIT_LABEL[group.unit]} · ultimo aggiornamento ${formatDate(group.updated)}`}
            >
              <div className="list">
                {group.rows.map((row, index) => {
                  const best = index === 0
                  return (
                    <button
                      type="button"
                      className="list-row"
                      key={row.store}
                      onClick={() => setOpened({ groupKey: group.key, store: row.store })}
                    >
                      {/* Il colore non porta il significato da solo: accanto c'è
                          sempre «il migliore» o quanto costa in più. */}
                      <span
                        className="chip-dot"
                        style={{ background: best ? 'var(--good)' : 'var(--series-rest)' }}
                        aria-hidden="true"
                      />
                      <span className="list-main">
                        <span className="list-title">{row.store}</span>
                        <span className="list-meta">
                          <span>{formatDate(row.latest.date)}</span>
                          {row.history.length > 1 ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{row.history.length} rilevazioni</span>
                            </>
                          ) : null}
                          {row.latest.note ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{row.latest.note}</span>
                            </>
                          ) : null}
                        </span>
                      </span>
                      <span className="list-amount">
                        {formatEuro(row.latest.price)}
                        <br />
                        {best ? (
                          <span className="list-amount-sub">
                            {group.rows.length === 1 ? 'unico rilevato' : 'il più conveniente'}
                          </span>
                        ) : (
                          <DeltaLabel change={row.overBest} />
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
              {group.rows.length === 1 ? (
                <div className="card-foot">
                  Un supermercato solo: il confronto comincia col secondo.
                </div>
              ) : null}
            </Card>
          ))
        )}

        {board.length > 0 ? (
          <Card>
            <p className="hint">
              Le rilevazioni non sono spese: non entrano nel margine, nel saldo né nelle
              statistiche. E non sono di nessuno dei due — un prezzo a scaffale è un fatto, quindi
              qui vedete lo stesso elenco.
            </p>
          </Card>
        ) : null}
      </div>

      {adding ? <PriceSheet onClose={() => setAdding(false)} /> : null}

      {opened && openedGroup && openedRow ? (
        <HistorySheet
          product={openedGroup.product}
          unit={openedGroup.unit}
          row={openedRow}
          onClose={() => setOpened(null)}
          onDelete={(priceId) => {
            deletePrice(priceId)
            toast.show('Rilevazione eliminata.')
            /* Era l'ultima di questo supermercato: il foglio non ha più niente da
               mostrare, quindi si chiude invece di restare vuoto. */
            if (openedRow.history.length === 1) setOpened(null)
          }}
        />
      ) : null}
    </>
  )
}
