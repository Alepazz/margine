/**
 * Dettaglio di una spesa: tag «da scaricare nel 730» e «pagata col welfare»,
 * nota e link allo scontrino su Drive. Il salvataggio è ottimistico —
 * l'annotazione compare subito e viene committata nel repo in sottofondo.
 *
 * I due tag si mettono **anche dall'inserimento** (`ExpenseForm`): si sanno
 * mentre si scrive la spesa, non il mese dopo. Qui restano perché è da qui che
 * si correggono su una spesa già in archivio — e nota e scontrino stanno solo
 * qui, che sono le due cose che arrivano davvero dopo.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'

import { useStore } from '../data/store'
import type { CategoryLookup } from '../domain/categories'
import { formatDate } from '../domain/dates'
import { formatEuro, toCents } from '../domain/money'
import { balanceDeltaOf } from '../domain/selectors'
import { tricountLabel } from '../domain/expense-rules'
import { soleMemberOf, type Expense } from '../domain/types'
import { ExpenseForm } from './ExpenseForm'
import { LedgerSelect } from './LedgerSelect'
import { useToast } from './ui'

/**
 * Un'etichetta che si accende e si spegne: titolo, cosa comporta adesso, e il
 * comando per cambiarla. Il 730 e il welfare sono la stessa cosa detta due volte,
 * quindi il testo è tutto in ingresso e la forma sta scritta una volta sola.
 */
function TagToggle({
  title,
  on,
  noteOn,
  noteOff,
  labelOn,
  labelOff,
  primary = false,
  onToggle,
}: {
  title: string
  on: boolean
  noteOn: string
  noteOff: string
  labelOn: string
  labelOff: string
  /** Solo per l'azione principale del foglio: le altre restano in outline. */
  primary?: boolean
  onToggle: () => void
}): ReactNode {
  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <div>
        <div className="card-title">{title}</div>
        <p className="card-note">{on ? noteOn : noteOff}</p>
      </div>
      <button
        type="button"
        className={on ? 'btn btn-danger btn-sm' : primary ? 'btn btn-primary btn-sm' : 'btn btn-sm'}
        onClick={onToggle}
      >
        {on ? labelOn : labelOff}
      </button>
    </div>
  )
}

/**
 * Spostare una spesa da un tricount a un altro, che è quello che si vuole
 * quando ci si accorge di aver scelto il gruppo sbagliato.
 *
 * Non è un cambio di etichetta: sposta un debito da un saldo a un altro, e sono
 * saldi che si confrontano uno per uno con Tricount. Per questo il pannello dice
 * **quanto** sposta prima di spostarlo, e per questo due casi non passano
 * silenziosamente:
 *
 * - fuori da una vacanza la quota di chi era con voi non esiste: se c'è, lo
 *   spostamento si rifiuta invece di buttarla via;
 * - in un tricount con un membro solo la spesa è al 100% di **quel membro**,
 *   quindi le quote si rifanno — tenerle divise creerebbe un debito dentro un
 *   tricount che per costruzione non ne ha.
 */
function MovePanel({ expense, onDone }: { expense: Expense; onDone: () => void }): ReactNode {
  const { config, dataset, updateExpense, view } = useStore()
  const toast = useToast()
  const current = expense.tricount
  const [target, setTarget] = useState(current)

  const tricounts = dataset?.tricounts ?? []
  const targetTricount = tricounts.find((t) => t.id === target)
  const targetMember = soleMemberOf(targetTricount)
  const othersShare = expense.shares.others ?? 0
  const blocked =
    targetTricount && !targetTricount.trip && toCents(othersShare) > 0
      ? 'Questa spesa ha una quota di chi era con voi, che esiste solo in vacanza: correggi le quote prima di spostarla.'
      : null

  const delta = balanceDeltaOf(expense)
  const label = (key: string): string => tricountLabel(key, tricounts)

  /**
   * Come diventa la spesa dopo lo spostamento.
   *
   * `paidBy` **non si tocca**, ed è la correzione di un difetto vero: forzarlo su
   * chi guarda cancellava il debito. Una spesa condivisa da 50 € pagata da
   * Federica e portata in «Personale» vuol dire «era tutta mia, e l'ha pagata
   * lei»: il debito passa da 25 a 50 €, non a zero. Chi ha pagato è un fatto
   * accaduto, non una conseguenza del tricount in cui la spesa finisce.
   */
  const fieldsFor = (): Partial<Expense> => {
    const fields: Partial<Expense> = { tricount: target }
    if (targetMember) {
      const whole = expense.amount
      fields.shares = targetMember === 'me' ? { me: whole, partner: 0 } : { me: 0, partner: whole }
    }
    return fields
  }

  const after: Expense = { ...expense, ...fieldsFor() }
  const deltaAfter = balanceDeltaOf(after)

  const move = (): void => {
    if (blocked || target === current) return
    updateExpense(expense.id, fieldsFor())
    toast.show(`Spostata in «${label(target)}».`)
    onDone()
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="field">
        <label className="label" htmlFor="move-ledger">
          Sposta in
        </label>
        <LedgerSelect
          id="move-ledger"
          value={target}
          tricounts={tricounts}
          person={view.person}
          onChange={setTarget}
        />
      </div>

      {blocked ? (
        <p className="delta is-bad">{blocked}</p>
      ) : target !== current ? (
        <p className="hint">
          {toCents(delta) === 0 && toCents(deltaAfter) === 0
            ? 'Il saldo non si muove: questa spesa non crea un debito fra voi.'
            : toCents(delta) === toCents(deltaAfter)
              ? `Sposta ${formatEuro(Math.abs(delta))} di debito da «${label(current)}» a «${label(target)}».`
              : /* Le quote si rifanno, quindi il debito non si sposta uguale: dirlo
                   prima, perché è il numero che poi si confronta con Tricount. */
                `Il debito passa da «${label(current)}» a «${label(target)}» e cambia: qui vale ${formatEuro(
                  Math.abs(delta),
                )}, là diventa ${formatEuro(Math.abs(deltaAfter))}.`}
          {targetMember && config
            ? ` Lì la spesa diventa tutta di ${config.people[targetMember].name}.`
            : ''}
        </p>
      ) : null}

      <div className="row" style={{ gap: 8 }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={blocked !== null || target === current}
          onClick={move}
        >
          Sposta
        </button>
        <button type="button" className="btn btn-sm" onClick={onDone}>
          Annulla
        </button>
      </div>
    </div>
  )
}

function isValidLink(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function ExpenseSheet({
  expense: opened,
  lookup,
  onClose,
}: {
  expense: Expense
  lookup: CategoryLookup
  onClose: () => void
}): ReactNode {
  const { config, dataset, annotate, deleteExpense, view } = useStore()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [moving, setMoving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  /*
   * La spesa si rilegge dallo store a ogni render invece di fidarsi della prop:
   * appena si tocca «Segna per il 730» il dato cambia, e il foglio deve dire la
   * verità di adesso, non quella del momento in cui è stato aperto.
   */
  const expense = dataset?.expenses.find((e) => e.id === opened.id) ?? opened

  const [notes, setNotes] = useState(expense.notes ?? '')
  const [linkDraft, setLinkDraft] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)

  // Solo all'apertura di un'altra spesa: non azzerare la nota che stai scrivendo.
  useEffect(() => {
    setNotes(opened.notes ?? '')
    setLinkDraft('')
    setLinkError(null)
  }, [opened.id, opened.notes])

  useEffect(() => {
    sheetRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const links = expense.receiptLinks ?? []
  const notesDirty = notes.trim() !== (expense.notes ?? '')
  const driveHint = config?.fiscal.driveFolderHint

  const toggleTax = () => {
    const next = !(expense.tax730 ?? false)
    annotate(expense.id, { tax730: next })
    toast.show(next ? 'Segnata come spesa da 730.' : 'Rimossa dal 730.')
  }

  const toggleWelfare = () => {
    const next = !(expense.welfare ?? false)
    annotate(expense.id, { welfare: next })
    toast.show(
      next ? 'Pagata col welfare: non erode più il budget.' : 'Torna a contare nel budget del mese.',
    )
  }

  const saveNotes = () => {
    annotate(expense.id, { notes: notes.trim() })
    toast.show('Nota salvata.')
  }

  const addLink = () => {
    const value = linkDraft.trim()
    if (!isValidLink(value)) {
      setLinkError('Serve un link completo, che cominci con https://')
      return
    }
    if (links.includes(value)) {
      setLinkError('Questo link c’è già.')
      return
    }
    annotate(expense.id, { receiptLinks: [...links, value] })
    setLinkDraft('')
    setLinkError(null)
    toast.show('Scontrino collegato.')
  }

  const removeLink = (link: string) => {
    annotate(expense.id, { receiptLinks: links.filter((l) => l !== link) })
    toast.show('Link rimosso.')
  }

  /* Il modulo prende il posto del foglio invece di impilarsi sopra: due fogli
     uno sull'altro non si capisce più quale si sta chiudendo. */
  if (editing) {
    return <ExpenseForm expense={expense} onClose={() => setEditing(false)} />
  }

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
        aria-label={`Dettaglio spesa: ${expense.title}`}
        tabIndex={-1}
        ref={sheetRef}
      >
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: '1.15rem' }}>{expense.title}</h2>
            <p className="card-note">
              {formatDate(expense.date)} · {lookup.emoji(expense.category)}{' '}
              {lookup.label(expense.category)}
              {expense.subcategory ? ` · ${lookup.subLabel(expense.category, expense.subcategory)}` : ''}
            </p>
          </div>
          <button type="button" className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Chiudi">
            ✕
          </button>
        </div>

        {/* Righe etichetta/valore invece di una tabella: su telefono una tabella
            a due colonne spezza le etichette in quattro righe. */}
        <dl className="kv">
          <div className="kv-row">
            <dt>Importo totale</dt>
            <dd className="num">{formatEuro(expense.amount)}</dd>
          </div>
          {config
            ? (['me', 'partner'] as const).map((id) => (
                <div className="kv-row" key={id}>
                  <dt>
                    Quota {config.people[id].name}
                    {id === view.person ? <span className="kv-tag"> vista attuale</span> : null}
                  </dt>
                  <dd className="num">{formatEuro(expense.shares[id] ?? 0)}</dd>
                </div>
              ))
            : null}
          {expense.shares.others ? (
            <div className="kv-row">
              <dt>Quota di chi era con voi</dt>
              <dd className="num">{formatEuro(expense.shares.others)}</dd>
            </div>
          ) : null}
          <div className="kv-row">
            <dt>Pagata da</dt>
            <dd>
              {expense.paidBy === 'others'
                ? 'Qualcuno del gruppo'
                : config
                  ? config.people[expense.paidBy].name
                  : expense.paidBy}
            </dd>
          </div>
          <div className="kv-row">
            <dt>Tricount</dt>
            <dd>{lookup.tricountTitle(expense.tricount)}</dd>
          </div>
          {expense.recurring ? (
            <div className="kv-row">
              <dt>Tipo</dt>
              <dd>Spesa fissa, ricorrente</dd>
            </div>
          ) : null}
          {expense.welfare ? (
            <div className="kv-row">
              <dt>Pagata con</dt>
              <dd>Welfare aziendale, fuori dal budget</dd>
            </div>
          ) : null}
        </dl>

        <div className="stack" style={{ gap: 12 }}>
          {confirmingDelete ? (
            <div className="stack" style={{ gap: 8 }}>
              <p className="delta is-bad">
                Eliminare «{expense.title}»? È definitivo: la spesa sparisce dai dati e dai conti.
              </p>
              <div className="row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    deleteExpense(expense.id)
                    toast.show('Spesa eliminata.')
                    onClose()
                  }}
                >
                  Sì, elimina
                </button>
                <button type="button" className="btn" onClick={() => setConfirmingDelete(false)}>
                  Annulla
                </button>
              </div>
            </div>
          ) : (
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn" onClick={() => setEditing(true)}>
                Modifica
              </button>
              <button type="button" className="btn" onClick={() => setMoving((on) => !on)}>
                Sposta di tricount
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConfirmingDelete(true)}
              >
                Elimina
              </button>
            </div>
          )}

          {moving && !confirmingDelete ? <MovePanel expense={expense} onDone={() => setMoving(false)} /> : null}

          <TagToggle
            title="Spesa da 730"
            on={expense.tax730 === true}
            noteOn="Compare nella sezione 730 dell’anno."
            noteOff="Non è ancora nella sezione 730."
            labelOn="Togli dal 730"
            labelOff="Segna per il 730"
            primary
            onToggle={toggleTax}
          />

          {/* Il welfare si segna solo su ciò che hai anticipato tu: sulla spesa
              di qualcun altro il flag non vorrebbe dire niente. */}
          {expense.paidBy === view.person ? (
            <TagToggle
              title="Pagata col welfare"
              on={expense.welfare === true}
              noteOn="Resta nel costo della vacanza e nell’elenco, ma non consuma il tuo margine del mese."
              noteOff="Oggi conta come uscita tua nel budget del mese."
              labelOn="Non era welfare"
              labelOff="Segna welfare"
              onToggle={toggleWelfare}
            />
          ) : null}

          <div className="field">
            <label className="label" htmlFor="expense-notes">
              Nota
            </label>
            <textarea
              id="expense-notes"
              className="textarea"
              value={notes}
              placeholder="Per esempio: fattura chiesta via mail, intestata a me"
              onChange={(event) => setNotes(event.target.value)}
            />
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-sm" disabled={!notesDirty} onClick={saveNotes}>
                Salva nota
              </button>
            </div>
          </div>

          <div className="field">
            <span className="label">Scontrini</span>
            {links.length > 0 ? (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {links.map((link, index) => (
                  <li className="row" key={link} style={{ justifyContent: 'space-between', gap: 8 }}>
                    <a href={link} target="_blank" rel="noreferrer noopener" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      🧾 Scontrino {index + 1}
                    </a>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => removeLink(link)}
                      aria-label={`Rimuovi scontrino ${index + 1}`}
                    >
                      Rimuovi
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">
                Nessuno scontrino collegato.{driveHint ? ` Le foto stanno in: ${driveHint}` : ''}
              </p>
            )}
            <div className="row" style={{ gap: 6 }}>
              <input
                className="input"
                style={{ flex: '1 1 180px' }}
                inputMode="url"
                placeholder="https://drive.google.com/…"
                value={linkDraft}
                onChange={(event) => {
                  setLinkDraft(event.target.value)
                  setLinkError(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addLink()
                  }
                }}
              />
              <button type="button" className="btn btn-sm" onClick={addLink} disabled={linkDraft.trim() === ''}>
                Collega
              </button>
            </div>
            {linkError ? <p className="delta is-bad">{linkError}</p> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
