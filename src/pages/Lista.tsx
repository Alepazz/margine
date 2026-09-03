/**
 * La lista della spesa: cosa resta da prendere, e sotto lo storico.
 *
 * Non usa `usePageData` di proposito, come le pagine Prezzi e Carte e per la
 * stessa ragione: quel gancio filtra le spese per la persona scelta, e qui non
 * c'è niente da filtrare — la lista della spesa è di casa. → ADR-0088, ADR-0041
 *
 * **Un tocco su una riga la sposta**: dalla lista allo storico e viceversa. È il
 * gesto che si fa in piedi, con una mano, davanti allo scaffale, e per questo il
 * bersaglio è la riga intera e non una casella da sedici pixel. Correggere una
 * voce è un gesto raro e sta dietro la matita: un tocco lungo non si scopre, e
 * su iOS fa comparire la selezione del testo. → ADR-0089
 *
 * **Una riga è un titolo, e il resto è un'informazione in più.** La quantità sta
 * incollata al titolo — «Latte 2 L» è una cosa sola — e nota e prezzo noto
 * scendono nella riga di contorno, dove compaiono **solo se ci sono**. La prima
 * versione incolonnava la quantità all'altro bordo e raggruppava per negozio:
 * bocciata da Alessio, «è poco da colpo d'occhio».
 *
 * **Il negozio invece non è un dettaglio: è un avviso.** Se una voce lo porta,
 * quasi sempre vuol dire «questa non la prendere qui», e leggerla come una nota
 * costa una cosa comprata due volte o nel posto sbagliato. Alessio: «mi deve
 * risaltare così evito di prendere cose che non siano previste per la spesa che
 * sto facendo». Quindi è una pastiglia con la tinta d'avviso e la parola
 * «Solo», non testo grigio in fila con la nota — e la parola c'è perché in
 * questo progetto il colore non porta mai il significato da solo. → ADR-0089
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { ShoppingSheet } from '../components/ShoppingSheet'
import { Card, Chip, Notice, ShowMore } from '../components/ui'
import { useReadyStore, type ProbeResult } from '../data/store'
import { formatEuro } from '../domain/money'
import { priceBoard, UNIT_LABEL } from '../domain/prices'
import { bestKnownPrice, qtyLabel, taken, toBuy } from '../domain/shopping'
import { aTo } from '../domain/text'
import type { ShoppingItem } from '../domain/types'

/** Ogni quanto si rilegge la lista dall'API mentre la pagina è aperta. → ADR-0090 */
const PROBE_MS = 30_000
/** Quante cose dello storico si mostrano prima di «mostra tutte». */
const HISTORY_PREVIEW = 12

function Riga({
  item,
  isTaken,
  price,
  /**
   * Senza il percorso del file la spunta non si potrebbe committare: entrerebbe
   * in coda, comparirebbe a schermo come fatta e non partirebbe mai. È il
   * difetto che le carte hanno già avuto, quindi qui la riga è **spenta** e
   * l'avviso sopra dice cosa manca. → ADR-0088, ADR-0082
   */
  readOnly,
  onToggle,
  onEdit,
}: {
  item: ShoppingItem
  isTaken: boolean
  price?: string
  readOnly: boolean
  onToggle: () => void
  onEdit: () => void
}): ReactNode {
  const quanto = qtyLabel(item)
  /* La nota e il prezzo noto: informazioni **in più**, e solo se ci sono. Il
     negozio no — quello è un avviso, e sta nella pastiglia qui sotto. */
  const contorno = [item.note, price].filter(
    (part): part is string => part !== undefined && part !== '',
  )
  /* Il negozio già ripulito, o `undefined`: così la pastiglia non ha bisogno di
     un `?? ''` che il compilatore accetta e che non può mai succedere. */
  const altrove = item.store?.trim() === '' ? undefined : item.store?.trim()

  return (
    <div className={`shop-line${isTaken ? ' is-taken' : ''}`}>
      <button
        type="button"
        className="shop-tap"
        disabled={readOnly}
        onClick={onToggle}
        /* `aria-pressed` e non un testo che cambia: per chi legge con la voce la
           riga è un interruttore, ed è esattamente quello che è. */
        aria-pressed={isTaken}
        aria-label={isTaken ? `${item.title}: rimetti nella lista` : `${item.title}: l’ho preso`}
      >
        <span className="shop-check" aria-hidden="true">
          {isTaken ? '✓' : ''}
        </span>
        <span className="list-main">
          {/* Titolo e quantità in una riga sola: il titolo si accorcia con i
              puntini, la quantità no. Sono la stessa informazione. */}
          <span className="shop-head">
            <span className="list-title">{item.title}</span>
            {quanto !== undefined ? <span className="shop-qty">{quanto}</span> : null}
          </span>
          {altrove !== undefined || contorno.length > 0 ? (
            <span className="list-meta">
              {/* Prima di tutto il resto: è la cosa che deve fermare la mano. */}
              {altrove !== undefined ? (
                <Chip tone="attenzione">
                  <span aria-hidden="true">📍</span> Solo {aTo(altrove)} {altrove}
                </Chip>
              ) : null}
              {contorno.length > 0 ? <span>{contorno.join(' · ')}</span> : null}
            </span>
          ) : null}
        </span>
      </button>
      {readOnly ? null : (
        <button
          type="button"
          className="btn btn-icon btn-ghost"
          onClick={onEdit}
          aria-label={`Modifica ${item.title}`}
          title="Modifica"
        >
          ✎
        </button>
      )}
    </div>
  )
}

export function Lista(): ReactNode {
  const { shopping, dataset, config, takeItem, untakeItem, refreshShopping } = useReadyStore()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ShoppingItem | undefined>(undefined)
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PREVIEW)
  /**
   * Com'è andata l'ultima sonda. Solo `failed` si dice a schermo: senza token la
   * spia di sincronizzazione parla già, e ripeterlo qui sarebbe rumore.
   */
  const [probe, setProbe] = useState<ProbeResult>('ok')

  const daPrendere = useMemo(() => toBuy(shopping), [shopping])
  const storico = useMemo(() => taken(shopping), [shopping])
  const board = useMemo(() => priceBoard(dataset.prices), [dataset.prices])

  /*
   * **La lista si rilegge dall'API finché questa pagina è aperta.** Con una
   * spunta per commit i deploy del sito stanno in coda uno alla volta, quindi
   * Pages resta indietro di minuti: le proprie spunte si vedono comunque (la
   * coda locale si riapplica sopra), quelle dell'altra persona no — ed è il caso
   * per cui una lista condivisa esiste. Anche al ritorno in primo piano, perché
   * durante una spesa il telefono si spegne e si riaccende continuamente.
   * → ADR-0090
   */
  useEffect(() => {
    let vivo = true
    const sonda = (): void => {
      void refreshShopping().then((esito) => {
        if (vivo) setProbe(esito)
      })
    }
    sonda()
    const timer = window.setInterval(sonda, PROBE_MS)
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') sonda()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      vivo = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refreshShopping])

  /*
   * Senza `github.shoppingPath` una voce **non si può salvare**: finirebbe in
   * coda, comparirebbe a schermo come salvata e non partirebbe mai. Quindi i
   * pulsanti spariscono, le righe si spengono, e resta la frase che dice cosa
   * manca — la stessa regola delle carte, che è nata da quel difetto.
   * → ADR-0088, ADR-0082
   */
  const readOnly = config.github !== null && !config.github.shoppingPath

  const riga = (item: ShoppingItem, isTaken: boolean): ReactNode => {
    /* Una volta per riga, non due: la versione con la chiamata dentro la
       condizione **e** dentro il valore scorreva tutto il tabellone dei prezzi
       due volte per ogni voce. */
    const known = bestKnownPrice(board, item.title)
    const price =
      known === undefined
        ? undefined
        : `${known.store} ${formatEuro(known.price)}${UNIT_LABEL[known.unit].replace('€', '')}`
    return (
      <Riga
        key={item.id}
        item={item}
        isTaken={isTaken}
        readOnly={readOnly}
        {...(price !== undefined ? { price } : {})}
        onToggle={() => (isTaken ? untakeItem(item.id) : takeItem(item.id))}
        onEdit={() => setEditing(item)}
      />
    )
  }

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1>🛒 Lista</h1>
          <p className="page-sub">
            {daPrendere.length === 0
              ? 'Niente da comprare'
              : `${String(daPrendere.length)} ${daPrendere.length === 1 ? 'cosa' : 'cose'} da prendere`}
          </p>
        </div>
      </div>

      <div className="stack">
        {readOnly ? (
          <Notice tone="warn">
            In <code>config.json</code> manca <code>github.shoppingPath</code>: la lista si vede ma
            non si può cambiare da qui.
          </Notice>
        ) : null}

        {shopping.length === 0 ? (
          <Card>
            <p className="empty">
              La lista è vuota. Scrivi quello che manca: basta il nome.
              <br />
              Quando prendi una cosa la tocchi e scende nello storico, che è anche il posto da cui
              la rimetti in lista la prossima volta.
            </p>
            {readOnly ? null : (
              <div className="card-foot" style={{ textAlign: 'center' }}>
                <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                  Aggiungi la prima cosa
                </button>
              </div>
            )}
          </Card>
        ) : (
          <>
            <Card title="Da prendere">
              {daPrendere.length === 0 ? (
                <p className="empty">
                  Preso tutto. Le cose nello storico si rimettono in lista con un tocco.
                </p>
              ) : (
                <div className="list">{daPrendere.map((item) => riga(item, false))}</div>
              )}
              {readOnly ? null : (
                <div className="card-foot">
                  <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                    Aggiungi una cosa
                  </button>
                </div>
              )}
            </Card>

            {storico.length > 0 ? (
              /* «Già preso» e non «Nel carrello»: è il passato, e lo ha corretto
                 Alessio — «non è nel carrello, ma è proprio il passato, quello
                 che è stato preso storicamente oppure 1 secondo fa». → ADR-0089 */
              <Card title="Già preso">
                <div className="list">
                  {storico.slice(0, historyLimit).map((item) => riga(item, true))}
                </div>
                <ShowMore
                  rest={Math.max(0, storico.length - historyLimit)}
                  step={HISTORY_PREVIEW}
                  onMore={() => setHistoryLimit((n) => n + HISTORY_PREVIEW)}
                />
                <p className="hint">
                  Dall’ultima cosa presa. È anche il vostro elenco dei soliti: un tocco la rimette
                  nella lista, con la quantità e il negozio che aveva.
                </p>
              </Card>
            ) : null}

            <Card>
              <p className="hint">
                La lista non è una spesa: non entra nel margine, nel saldo né nelle statistiche. E
                non è di nessuno dei due — qui vedete la stessa lista.
                {probe === 'failed'
                  ? ' Ora però non riesco a rileggerla da GitHub: quello che vedi arriva dal sito, e le modifiche dell’altra persona possono arrivare con qualche minuto di ritardo.'
                  : ''}
              </p>
            </Card>
          </>
        )}
      </div>

      {adding ? <ShoppingSheet onClose={() => setAdding(false)} /> : null}
      {editing ? <ShoppingSheet item={editing} onClose={() => setEditing(undefined)} /> : null}
    </>
  )
}
