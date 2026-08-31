/**
 * Le novità: cosa ha cambiato l'altra persona, in una frase per cosa.
 *
 * **È una casella di posta, non un registro.** Contiene solo ciò che non hai
 * ancora svuotato; premuto il pulsante è vuota finché non arriva altro. Lo
 * storico completo sta in `git log`, che è il posto dove vive davvero — qui
 * starebbe stretto e non servirebbe a nessuno. → ADR-0052
 *
 * E aprire **non** dichiara letto: leggere e archiviare sono due gesti, e
 * confonderli fa sparire una notifica mentre la stai guardando.
 *
 * Una riga per **cosa**, non per salvataggio: se l'altra persona salva tre
 * spese insieme l'app fa un commit solo, ma quello che vuoi leggere sono tre
 * spese con tre importi. Il salvataggio è un dettaglio tecnico, e mostrarlo
 * come titolo — «1 spesa aggiunta» — obbligava a decifrare invece di leggere.
 */

import { useCallback, useEffect, useRef, type ReactNode } from 'react'

import { useReadyStore } from '../data/store'
import { phraseOf, type NoticeItem } from '../domain/changes'
import { formatDate, todayIso } from '../domain/dates'
import { changedFields, type ExpenseDelta } from '../domain/diff'
import { formatEuro } from '../domain/money'
import { tricountTitleOf, type Category, type Tricount } from '../domain/types'
import { Notice, useScrollLock } from './ui'



const VERB: Record<ExpenseDelta['kind'], string> = {
  added: 'ha aggiunto',
  changed: 'ha corretto',
  removed: 'ha eliminato',
}

function dayLabel(iso: string, today: string): string {
  if (iso === today) return 'Oggi'
  const yesterday = new Date(`${today}T12:00:00.000Z`)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  if (iso === yesterday.toISOString().slice(0, 10)) return 'Ieri'
  return formatDate(iso)
}

function timeLabel(at: string): string {
  return new Date(at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

/** «Oggi · 14:32»: quando è successo, in fondo alla riga di contorno. */
function whenLabel(at: string, today: string): string {
  return `${dayLabel(at.slice(0, 10), today)} · ${timeLabel(at)}`
}

/**
 * Il contorno di una spesa: categoria, tricount, e i campi mossi.
 *
 * **Senza l'importo**, che è passato a destra da solo: era la prima voce di
 * questa fila e si leggeva come uno degli attributi, mentre è la cosa che si
 * cerca quando arriva una notifica. → ADR-0076
 *
 * Legge da `config.categories` e `dataset.tricounts` invece di passare da
 * `usePageData`: quello prepara serie mensili e insiemi filtrati per le pagine,
 * e qui serve un'emoji e due nomi. Un foglio della cornice non deve dipendere
 * dall'apparato delle pagine.
 */
function detailOf(
  delta: ExpenseDelta,
  categories: readonly Category[],
  tricounts: readonly Tricount[],
): string {
  const category = categories.find((c) => c.id === delta.expense.category)
  const tricount = tricounts.find((t) => t.id === delta.expense.tricount)
  const parts: string[] = []
  if (category) parts.push(category.emoji ? `${category.emoji} ${category.label}` : category.label)
  parts.push(tricount ? tricountTitleOf(tricount) : delta.expense.tricount)
  const fields = delta.kind === 'changed' ? changedFields(delta) : []
  if (fields.length > 0) parts.push(fields.join(', '))
  return parts.join(' · ')
}

export function NewsSheet({ onClose }: { onClose: () => void }): ReactNode {
  const { news, config, dataset, view, markNewsRead, markNewsSeen, loadNewsDetail } = useReadyStore()
  const sheetRef = useRef<HTMLDivElement | null>(null)

  useScrollLock()

  /**
   * Chiudere dichiara **guardate**, non archiviate: il pallino si spegne e
   * l'elenco resta finché non lo svuoti col pulsante. Passano tutti e tre i
   * gesti di chiusura — la X, Esc, il tocco fuori — perché sono tre modi di
   * fare la stessa cosa e uno che si comportasse diversamente somiglierebbe a
   * un difetto invece che a una scelta. → ADR-0061
   */
  const chiudi = useCallback(() => {
    markNewsRead()
    onClose()
  }, [markNewsRead, onClose])

  useEffect(() => {
    sheetRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') chiudi()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chiudi])

  const other = config.people[view.person === 'me' ? 'partner' : 'me']
  const today = todayIso()

  /** Il testo di una riga: qui, perché serve sapere come si chiamano le persone. */
  const testoDi = (notice: NoticeItem): string => {
    const chi = news.knowsMe ? other.name : notice.who
    if (notice.kind === 'delta') return `${chi} ${VERB[notice.delta.kind]} ${notice.delta.expense.title}`
    return `${chi} ${phraseOf(notice.part)}`
  }

  const vuota = news.notices.length === 0

  return (
    <div
      className="sheet-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) chiudi()
      }}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Novità"
        tabIndex={-1}
        ref={sheetRef}
      >
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: '1.15rem' }}>Novità</h2>
            <p className="card-note">
              {news.knowsMe
                ? `Cosa ha cambiato ${other.name} da quando hai svuotato`
                : 'Senza token non so quali commit siano miei, quindi ci sono anche quelli'}
            </p>
          </div>
          <button type="button" className="btn btn-icon btn-ghost" onClick={chiudi} aria-label="Chiudi">
            ✕
          </button>
        </div>

        <div className="sheet-body">
          {/* La colonna sta **dentro** il corpo, non è il corpo: `.sheet-body`
              è il contenitore che scorre, e farlo diventare flex esporrebbe i
              figli alla compressione invece dello scorrimento. → ADR-0030 */}
          <div className="stack" style={{ gap: 12 }}>
            {/*
              Il guasto sta **sopra** l'elenco, non al posto suo. Sostituirlo
              costava le novità già arrivate — una lettura fallita non tocca
              `changes`, quindi restano in memoria e il pallino continua a
              contarle: misurato, pallino a 4 e foglio a zero righe. → ADR-0053
            */}
            {news.error !== undefined ? <Notice tone="bad">{news.error}</Notice> : null}

            {vuota ? (
              /* Con un guasto a schermo «Niente di nuovo» direbbe il falso: là
                 fuori non si sa cosa ci sia, ed è esattamente il punto. */
              news.error !== undefined ? null : (
                <p className="hint">
                  {news.loading
                    ? 'Sto leggendo…'
                    : news.knowsMe
                      ? `Niente di nuovo. Quando ${other.name} aggiunge o corregge qualcosa, lo trovi qui.`
                      : 'Niente di nuovo. Quando qualcosa cambia nei dati, lo trovi qui.'}
                </p>
              )
            ) : (
              /*
                Elenco piatto, senza intestazioni di giorno: questa è una
                casella di posta, e quello che ci sta dentro è **solo** ciò che
                non è stato svuotato (→ ADR-0052) — poche righe, non un
                archivio. Il giorno sta in ogni riga, accanto all'ora, dove
                prima stava l'importo. → ADR-0076
              */
              <div className="list">
                {news.notices.map((notice) => {
                  const dettaglio =
                    notice.kind === 'delta'
                      ? detailOf(notice.delta, config.categories, dataset.tricounts)
                      : notice.failed
                        ? 'non sono riuscito a leggerne il contenuto · tocca per riprovare'
                        : undefined
                  /* Una riga fallita si riprova toccandola: il ciclo automatico
                     salta ciò che ha già uno stato, quindi senza questo una rete
                     caduta per un istante lascerebbe la riga vaga per tutta la
                     sessione. */
                  const riprova = notice.kind === 'summary' && notice.failed === true
                  const change = news.changes.find((c) => c.sha === notice.sha)
                  const quando = whenLabel(notice.at, today)
                  return (
                    <div
                      className={`news-row${riprova ? ' is-retry' : ''}`}
                      key={notice.key}
                      onClick={riprova && change ? () => void loadNewsDetail(change) : undefined}
                      role={riprova ? 'button' : undefined}
                      tabIndex={riprova ? 0 : undefined}
                      onKeyDown={
                        riprova && change
                          ? (event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                void loadNewsDetail(change)
                              }
                            }
                          : undefined
                      }
                    >
                      <div className="news-text">
                        <span className={notice.kind === 'summary' && notice.pending ? 'news-pending' : undefined}>
                          {testoDi(notice)}
                        </span>
                        <span className="news-sub">
                          {dettaglio === undefined ? quando : `${quando} · ${dettaglio}`}
                        </span>
                      </div>
                      {/* L'importo dove prima stava l'ora, e più grande di
                          quanto l'ora sia mai stata: è la cosa per cui si apre
                          la campanella. Le righe che non sono una spesa non ne
                          hanno uno, e la colonna resta vuota invece di
                          ospitare un'altra cosa nello stesso posto. */}
                      {notice.kind === 'delta' ? (
                        <span className="news-amount">{formatEuro(notice.delta.expense.amount)}</span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Nel piede e non in fondo all'elenco: il piede non scorre, quindi il
            pulsante si raggiunge anche con venti notifiche dentro. */}
        {vuota ? null : (
          <div className="sheet-foot">
            <button type="button" className="btn btn-primary" onClick={markNewsSeen}>
              Svuota notifiche
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
