/**
 * Le novità: cosa ha cambiato l'altra persona, e quando.
 *
 * Non è un registro completo del repo — i commit di codice restano fuori, e i
 * propri anche: le tue azioni le hai appena fatte tu, e a dirti che sono
 * arrivate ci pensa lo stato «salvato» nella testata. Qui c'è solo ciò che è
 * successo mentre non guardavi. → ADR-0051
 *
 * **Aprire questo foglio è ciò che segna letto**, e non è un dettaglio: aprire
 * l'app non consuma niente, così una guardata di tre secondi al supermercato
 * non fa sparire una novità che non hai avuto il tempo di leggere.
 */

import { useEffect, useMemo, useRef, type ReactNode } from 'react'

import { useReadyStore } from '../data/store'
import { type Change } from '../domain/changes'
import { formatDate, todayIso } from '../domain/dates'
import { changedFields, visibleDeltas, type ExpenseDelta } from '../domain/diff'
import { formatEuro } from '../domain/money'
import { tricountTitleOf, type Category, type Tricount } from '../domain/types'
import { useScrollLock } from './ui'

/** Quante novità caricano il contenuto da sole all'apertura. */
const MAX_AUTO_DETAIL = 5

const VERBS: Record<ExpenseDelta['kind'], string> = {
  added: '+',
  changed: '~',
  removed: '−',
}

/**
 * Categoria e tricount di una spesa, più i campi mossi se è una modifica.
 *
 * Legge da `config.categories` e `dataset.tricounts` invece di passare da
 * `usePageData`: quello prepara serie mensili e insiemi filtrati per le pagine,
 * e qui serve solo un'emoji e un nome. Un foglio della cornice non deve
 * dipendere dall'apparato delle pagine.
 */
function where(
  delta: ExpenseDelta,
  categories: readonly Category[],
  tricounts: readonly Tricount[],
): string {
  const category = categories.find((c) => c.id === delta.expense.category)
  const tricount = tricounts.find((t) => t.id === delta.expense.tricount)
  const parts = [
    category?.emoji ? `${category.emoji} ${category.label}` : (category?.label ?? ''),
    tricount ? tricountTitleOf(tricount) : delta.expense.tricount,
  ].filter((part) => part !== '')
  const fields = delta.kind === 'changed' ? changedFields(delta) : []
  if (fields.length > 0) parts.push(fields.join(', '))
  return parts.join(' · ')
}

/** Il giorno di una novità, in ISO, per raggrupparle. */
function dayOf(change: Change): string {
  return change.at.slice(0, 10)
}

function dayLabel(iso: string, today: string): string {
  if (iso === today) return 'Oggi'
  const yesterday = new Date(`${today}T12:00:00.000Z`)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  if (iso === yesterday.toISOString().slice(0, 10)) return 'Ieri'
  return formatDate(iso)
}

/** L'ora locale: la data sta già nell'intestazione del gruppo. */
function timeLabel(at: string): string {
  return new Date(at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

export function NewsSheet({ onClose }: { onClose: () => void }): ReactNode {
  const { news, config, dataset, view, markNewsSeen, loadNewsDetail, newsDetail } = useReadyStore()
  const sheetRef = useRef<HTMLDivElement | null>(null)

  useScrollLock()

  /*
   * Il conteggio del pallino **prima** di segnare letto: serve a dividere le
   * righe nuove da quelle già viste, e `markNewsSeen` lo azzera subito dopo.
   * Congelato al montaggio di proposito — se si ricalcolasse, la riga «nuove»
   * sparirebbe sotto gli occhi mentre la stai leggendo.
   */
  const unseenAtOpen = useRef(news.unseen)

  useEffect(() => {
    sheetRef.current?.focus()
    markNewsSeen()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [markNewsSeen, onClose])

  /*
   * Le prime righe caricano il contenuto da sé, **viste o non viste**.
   *
   * Legare il caricamento alle sole non viste sembrava logico e all'uso non lo
   * era: aprendo la campanella una seconda volta, con niente di nuovo, si
   * trovava un muro di pulsanti «Cosa ha toccato» — cioè esattamente il gesto
   * che questa funzione esiste per togliere. Ciò che si guarda è in cima,
   * indipendentemente da quando è arrivato.
   *
   * Il tetto è la ragione per cui non si caricano tutte: ogni dettaglio costa
   * fino a due file da 359 KB. Cinque è quanto ci sta a schermo; sotto, il
   * pulsante resta e decidi tu. La cache dello store vale per la sessione,
   * quindi riaprire la campanella non ripaga niente.
   *
   * In fila, non in parallelo: novità consecutive condividono i file, e la
   * cache per sha se ne accorge solo se le richieste non si accavallano.
   */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      for (const change of news.changes.slice(0, MAX_AUTO_DETAIL)) {
        if (cancelled) return
        /* Solo ciò che non è mai stato chiesto: chi è già `done`, `loading` o
           `failed` non si ritocca. Senza questa riga, ogni arrivo di nuovi
           commit rilancerebbe anche i tentativi falliti, all'infinito. */
        if (newsDetail(change.sha) !== undefined) continue
        await loadNewsDetail(change)
      }
    })()
    return () => {
      cancelled = true
    }
    /*
     * Dipende da `news.changes`, non dal solo montaggio.
     *
     * Con le dipendenze vuote il ciclo leggeva l'elenco **al momento in cui la
     * campanella si apriva**: aprendola prima che la lista fosse arrivata,
     * l'array era vuoto e non si caricava mai niente — si rimediava solo
     * chiudendo e riaprendo. Ora riparte quando la lista cambia, e la riga qui
     * sopra fa sì che ripartire non costi niente.
     *
     * `loadNewsDetail` e `newsDetail` restano fuori: cambiano identità a ogni
     * scrittura nella cache, e metterli qui farebbe girare il ciclo a vuoto
     * dopo ogni singolo dettaglio caricato.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [news.changes])

  /* L'altra persona: chi non sono io. Nome ed emoji stanno nei dati. */
  const other = config.people[view.person === 'me' ? 'partner' : 'me']
  const today = todayIso()

  /*
   * Le righe raggruppate per giorno, e insieme la posizione di ciascuna
   * nell'elenco piatto: serve a sapere quali sono «nuove» — l'elenco è ordinato
   * dalla più recente, quindi le prime `unseenAtOpen` lo sono. Si conosce già
   * raggruppando, e ricavarla riga per riga a ogni render vorrebbe dire
   * riattraversare i giorni precedenti ogni volta.
   */
  const { days, positions } = useMemo(() => {
    const grouped = new Map<string, Change[]>()
    const index = new Map<string, number>()
    news.changes.forEach((change, position) => {
      index.set(change.sha, position)
      const key = dayOf(change)
      const list = grouped.get(key)
      if (list) list.push(change)
      else grouped.set(key, [change])
    })
    return { days: [...grouped.entries()], positions: index }
  }, [news.changes])

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
                ? `Cosa ha cambiato ${other.name} da quando non guardavi`
                : 'Cosa è cambiato nei dati. Senza token non so quali commit siano miei, quindi ci sono anche quelli'}
            </p>
          </div>
          <button type="button" className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Chiudi">
            ✕
          </button>
        </div>

        <div className="sheet-body">
          {news.changes.length === 0 ? (
            <p className="hint">
              {news.loading
                ? 'Sto leggendo lo storico…'
                : news.knowsMe
                  ? `Niente di nuovo. Quando ${other.name} aggiunge o corregge qualcosa, lo trovi qui.`
                  : 'Niente di nuovo. Quando qualcosa cambia nei dati, lo trovi qui.'}
            </p>
          ) : (
            <div className="stack" style={{ gap: 14 }}>
              {days.map(([day, list]) => (
                <div key={day}>
                  <div className="news-day">{dayLabel(day, today)}</div>
                  {list.map((change) => {
                    const position = positions.get(change.sha) ?? 0
                    const riga = (
                      <div className="news-row">
                        {/* L'emoji dell'altra persona **solo** se so che le
                            righe rimaste sono sue. Altrimenti l'autore, per
                            esteso: dire «Federica» su un commit mio sarebbe
                            un'attribuzione inventata, e l'unica cosa peggiore
                            di non sapere chi è stato è dirlo sbagliato. */}
                        {news.knowsMe ? (
                          <span className="news-emoji" aria-hidden="true">
                            {other.emoji}
                          </span>
                        ) : (
                          <span className="news-who">{change.who}</span>
                        )}
                        <span className="news-text">
                          {change.summary}
                          {position < unseenAtOpen.current ? (
                            <span className="news-new">nuovo</span>
                          ) : null}
                        </span>
                        <span className="news-time">{timeLabel(change.at)}</span>
                      </div>
                    )
                    const detail = newsDetail(change.sha)
                    const visible =
                      detail?.state === 'done'
                        ? visibleDeltas(detail.deltas, dataset.tricounts, view.person)
                        : undefined
                    return (
                      <div key={change.sha}>
                        {riga}
                        {detail === undefined ? (
                          change.parent === null ? null : (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm news-more"
                              onClick={() => void loadNewsDetail(change)}
                            >
                              Cosa ha toccato ›
                            </button>
                          )
                        ) : detail.state === 'loading' ? (
                          <p className="news-detail-none">Sto leggendo quel commit…</p>
                        ) : detail.state === 'failed' ? (
                          /* Dirlo, e dire perché: un pulsante che scarica mezzo
                             megabyte e poi tace è il difetto di ADR-0043. */
                          <p className="news-detail-none">
                            {detail.reason}{' '}
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm news-more"
                              style={{ margin: 0 }}
                              onClick={() => void loadNewsDetail(change)}
                            >
                              Riprova
                            </button>
                          </p>
                        ) : visible !== undefined && visible.length === 0 ? (
                          /* Il commit c'è, ma non riguarda un tricount di cui sei
                             membro: il fatto non è segreto, il contenuto sì. */
                          <p className="news-detail-none">Fuori dai tuoi tricount</p>
                        ) : (
                          <div className="news-detail">
                            {(visible ?? []).map((delta) => (
                              <div className="news-detail-row" key={delta.expense.id}>
                                <span className="news-detail-verb">{VERBS[delta.kind]}</span>
                                <span className="news-detail-title">{delta.expense.title}</span>
                                <span className="news-detail-amount num">
                                  {formatEuro(delta.expense.amount)}
                                </span>
                                <span className="news-detail-where">
                                  {where(delta, config.categories, dataset.tricounts)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
