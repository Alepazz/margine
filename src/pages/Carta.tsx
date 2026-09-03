/**
 * La tessera aperta: quello che si mette davanti al lettore.
 *
 * È una **rotta** e non un foglio, e la ragione è la cassa: serve il gesto
 * «indietro» del sistema, serve poterla raggiungere da un segnalibro, e serve
 * che riaprirla dopo aver bloccato il telefono riporti dov'era.
 *
 * **Si apre a tutto schermo, e l'app sparisce.** Alla cassa la sola cosa che
 * serve è il codice, e tutto il resto — testata, barra, «‹ Carte», la scheda
 * dei dettagli — è rumore intorno a un rettangolo che deve leggere una macchina.
 * Quindi la rotta parte in **primo piano**: fondo scuro, la tessera e basta.
 * «Dettagli» la riporta dentro l'app, con la scheda sotto; da lì «A tutto
 * schermo» la rimanda davanti al lettore. Lo stato è locale e non nell'URL:
 * «indietro» dal primo piano torna al mazzo, che è il gesto della cassa, e non a
 * uno stato intermedio che nessuno ha chiesto di rivedere. → ADR-0085
 *
 * **La faccia è bianca anche col tema scuro.** Non è una dimenticanza del tema:
 * un lettore ottico misura il contrasto fra le barre e il fondo, e un fondo
 * grigio scuro riduce quel contrasto fino a farlo sbagliare. È anche la cosa che
 * più somiglia ad alzare la luminosità, che dal browser **non si può fare** —
 * nessuna API esiste, la proposta è stata abbandonata nel 2022. Insieme al
 * bianco c'è `useWakeLock`, perché lo schermo non si spenga nella fila alla
 * cassa. → ADR-0084
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { Barcode } from '../components/Barcode'
import { CardSheet } from '../components/CardSheet'
import { Card, Notice, useEscape, useScrollLock, useToast, useWakeLock } from '../components/ui'
import { markCardUsed } from '../data/card-use'
import { useReadyStore } from '../data/store'
import { encodeBarcode, groupCode, type Barcode as BarcodePattern } from '../domain/barcode'
import { FORMAT_LABEL, inkOn } from '../domain/cards'
import { formatDate } from '../domain/dates'
import type { LoyaltyCard } from '../domain/types'

/**
 * La tessera: fascia col nome e faccia col codice. È la stessa in primo piano e
 * dentro l'app — cambia solo cosa fa il bottone nella fascia — ed è **una**
 * perché due copie del disegno finirebbero per divergere sul dettaglio che
 * conta, cioè la faccia che il lettore deve leggere.
 */
function CardBody({
  card,
  drawn,
  numero,
  action,
}: {
  card: LoyaltyCard
  drawn: BarcodePattern | undefined
  numero: string
  action: { label: string; onClick: () => void }
}): ReactNode {
  return (
    <div className="card-open">
      {/* Senza tinta la fascia è neutra e usa l'inchiostro del tema: un
          ripiego «chiaro» scriverebbe bianco su una superficie chiara. */}
      <div
        className={
          card.color === undefined
            ? 'card-open-band is-plain'
            : `card-open-band is-ink-${inkOn(card.color)}`
        }
        style={card.color !== undefined ? { background: card.color } : undefined}
      >
        {card.image !== undefined ? (
          <img className="card-open-logo" src={card.image} alt="" />
        ) : null}
        <span className="card-open-name">{card.name}</span>
        <button type="button" className="card-open-details" onClick={action.onClick}>
          {action.label}
        </button>
      </div>

      <div className="card-open-face">
        {drawn ? (
          <Barcode code={drawn} label={numero} />
        ) : (
          <p className="card-open-nobarcode">
            {card.format === 'qr'
              ? 'Il QR non si disegna ancora: alla cassa serve il numero.'
              : 'Questa carta non ha un codice a barre: alla cassa si dà il numero.'}
          </p>
        )}
        <div className="card-number">{numero}</div>
      </div>
    </div>
  )
}

/**
 * Il primo piano: un fondo scuro su tutta l'app e, in mezzo, la tessera.
 *
 * Si chiude toccando il fondo, con «Torna alle carte» o con Esc. Il tocco sul
 * fondo si riconosce dal **bersaglio**, non fermando la propagazione dentro la
 * tessera: così il bottone «Dettagli» e il collegamento in fondo non chiudono
 * due volte, e un tocco sulla faccia non chiude — alla cassa la faccia si tocca
 * per sbaglio, mentre si allunga il telefono verso il lettore.
 *
 * `useScrollLock` sta qui e non nella pagina perché vale solo in primo piano:
 * il fondo è dentro `.content`, quindi un trascinamento su di lui farebbe
 * scorrere la pagina sotto, invisibile ma spostata.
 */
function CardFocus({
  label,
  onClose,
  children,
}: {
  label: string
  onClose: () => void
  children: ReactNode
}): ReactNode {
  useScrollLock()
  useEscape(onClose)

  return (
    <div
      className="card-focus"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {children}
      <button type="button" className="card-focus-close" onClick={onClose}>
        <span aria-hidden="true">‹</span> Torna alle carte
      </button>
    </div>
  )
}

export function Carta(): ReactNode {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { cards, deleteCard, config } = useReadyStore()
  const [editing, setEditing] = useState(false)
  /* Si parte in primo piano: aprire una tessera vuol dire mostrarla al lettore. */
  const [focus, setFocus] = useState(true)
  const [confirming, setConfirming] = useState(false)

  const card = cards.find((entry) => entry.id === id)

  /*
   * Lo schermo resta acceso mentre la tessera è aperta, in primo piano e no. Il
   * gancio sta **prima** del ritorno anticipato qui sotto, perché i ganci di
   * React non si possono chiamare in un ramo condizionale.
   */
  useWakeLock()

  /*
   * Segna l'uso, che è ciò che fa salire questa carta nell'ordine «usate di
   * recente». In un effetto e non in un inizializzatore di `useState`: sotto
   * `StrictMode` un inizializzatore gira **due volte**, e scrivere in
   * `localStorage` non è il lavoro di una funzione che deve essere pura.
   */
  const cardId = card?.id
  useEffect(() => {
    if (cardId !== undefined) markCardUsed(cardId)
  }, [cardId])

  const close = useCallback(() => {
    void navigate('/carte')
  }, [navigate])

  if (!card) {
    return (
      <>
        <div className="page-head">
          <div className="page-head-text">
            <h1>Carta</h1>
          </div>
        </div>
        <Notice tone="warn">
          Questa carta non c’è più. <Link to="/carte">Torna al mazzo</Link>.
        </Notice>
      </>
    )
  }

  const drawn = encodeBarcode(card.code, card.format)
  const numero = groupCode(card.code, card.format)
  const readOnly = config.github !== null && !config.github.cardsPath

  if (focus) {
    return (
      <CardFocus label={card.name} onClose={close}>
        <CardBody
          card={card}
          drawn={drawn}
          numero={numero}
          action={{ label: 'Dettagli', onClick: () => setFocus(false) }}
        />
      </CardFocus>
    )
  }

  return (
    <>
      {/* La via del ritorno porta al mazzo, non all'hub: da lì si è arrivati, e
          alla cassa si passa da una tessera all'altra. */}
      <Link className="hub-back" to="/carte">
        <span aria-hidden="true">‹</span> Carte
      </Link>

      <div className="stack">
        <CardBody
          card={card}
          drawn={drawn}
          numero={numero}
          action={{ label: 'A tutto schermo', onClick: () => setFocus(true) }}
        />

        <Card title="Dettagli">
          {/* `.kv` e non una tabella: su schermo strettissimo una tabella
              spezza le etichette su quattro righe. */}
          <dl className="kv">
            <div className="kv-row">
              <dt>Numero</dt>
              <dd className="num">{card.code}</dd>
            </div>
            <div className="kv-row">
              <dt>Tipo di codice</dt>
              <dd>{FORMAT_LABEL[card.format]}</dd>
            </div>
            <div className="kv-row">
              <dt>Aggiunta</dt>
              <dd>{formatDate(card.addedAt)}</dd>
            </div>
            {card.note !== undefined ? (
              <div className="kv-row">
                <dt>Nota</dt>
                {/* Una nota può essere lunga: qui va a capo invece di
                    allargare la riga. */}
                <dd style={{ whiteSpace: 'normal' }}>{card.note}</dd>
              </div>
            ) : null}
          </dl>

          {readOnly ? (
            <p className="hint">
              Manca <code>github.cardsPath</code>: da qui non si può modificare.
            </p>
          ) : (
            <div className="stack" style={{ gap: 6, marginTop: 12 }}>
              <button type="button" className="btn" onClick={() => setEditing(true)}>
                Modifica
              </button>
              {confirming ? (
                <>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => {
                      deleteCard(card.id)
                      toast.show(`${card.name}: carta eliminata.`)
                      void navigate('/carte')
                    }}
                  >
                    Sì, elimina «{card.name}»
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setConfirming(false)}
                  >
                    Annulla
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setConfirming(true)}
                >
                  Elimina
                </button>
              )}
            </div>
          )}
        </Card>

        <p className="hint" style={{ textAlign: 'center' }}>
          Lo schermo resta acceso finché la tessera è aperta.
        </p>
      </div>

      {editing ? <CardSheet card={card} onClose={() => setEditing(false)} /> : null}
    </>
  )
}
