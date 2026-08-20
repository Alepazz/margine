/**
 * Inserire e correggere una spesa dal telefono.
 *
 * L'ordine dei campi è quello in cui si pensa una spesa: **prima il tricount**,
 * perché è lui a decidere tutto il resto — se c'è una divisione da scegliere, se
 * esiste una quota di terzi, quali categorie hanno senso — poi cos'era, quanto,
 * di che tipo, come si divide, e per ultima la data, che nove volte su dieci è
 * oggi e non si tocca.
 *
 * La divisione si sceglie con tre pulsanti invece di comporre due numeri che
 * devono sommare all'importo: in due anni di dati esistono **solo** tre modi di
 * dividere una spesa fuori dalle vacanze — tutta tua, tutta sua, metà e metà —
 * e la quarta possibilità resta a mano per il caso che non è ancora capitato.
 *
 * Le regole di validità sono quelle di `domain/expense-rules.ts`, le stesse che
 * l'import applica alla sessione mensile: qui si vedono mentre si sbaglia, là
 * fermano il file prima che venga cifrato. → ADR-0018
 */

import { useMemo, useState, type ReactNode } from 'react'

import { useStore } from '../data/store'
import { todayIso } from '../domain/dates'
import {
  ledgerKeyOf,
  ledgerParts,
  presetOf,
  sharesFor,
  splitFor,
  validateExpense,
  type SplitPreset,
} from '../domain/expense-rules'
import { newExpenseId } from '../domain/ids'
import { toCents } from '../domain/money'
import type { Expense, Payer, Trip } from '../domain/types'
import { LedgerSelect } from './LedgerSelect'
import { TripForm } from './TripForm'
import { Segmented, TilePicker, useToast, type TileOption } from './ui'

/** Accetta la virgola: sulla tastiera del telefono è quello che esce. */
function parseAmount(text: string): number {
  const normalised = text.trim().replace(',', '.')
  if (normalised === '') return Number.NaN
  return Math.round(Number(normalised) * 100) / 100
}

function amountText(value: number): string {
  return value.toFixed(2).replace('.', ',')
}

const SPLIT_LABELS: Record<SplitPreset, string> = {
  half: 'Metà',
  mine: 'Tutta mia',
  theirs: 'Tutta sua',
  custom: 'A mano',
}

export function ExpenseForm({
  expense: editing,
  onClose,
}: {
  /** Presente = si sta correggendo una spesa che esiste. */
  expense?: Expense
  onClose: () => void
}): ReactNode {
  const { config, dataset, view, addExpense, updateExpense, addTrip } = useStore()
  const toast = useToast()
  const person = view.person
  const other = person === 'me' ? 'partner' : 'me'

  const [title, setTitle] = useState(editing?.title ?? '')
  const [amount, setAmount] = useState(editing ? amountText(editing.amount) : '')
  const [date, setDate] = useState(editing?.date ?? todayIso())
  const [ledger, setLedger] = useState(editing ? ledgerKeyOf(editing) : 'condivise')
  const [category, setCategory] = useState(editing?.category ?? '')
  const [subcategory, setSubcategory] = useState(editing?.subcategory ?? '')
  const [preset, setPreset] = useState<SplitPreset>(editing ? presetOf(editing, person) : 'half')
  /* Le due caselle a mano sono «la tua» e «la sua» viste da chi guarda, non le
     due chiavi fisse: aprendo con Federica selezionata vanno scambiate. */
  const [mineText, setMineText] = useState(
    editing ? amountText(person === 'me' ? editing.shares.me : editing.shares.partner) : '',
  )
  const [theirsText, setTheirsText] = useState(
    editing ? amountText(person === 'me' ? editing.shares.partner : editing.shares.me) : '',
  )
  const [othersText, setOthersText] = useState(
    editing?.shares.others ? amountText(editing.shares.others) : '',
  )
  const [paidBy, setPaidBy] = useState<Payer>(editing?.paidBy ?? person)
  const [recurring, setRecurring] = useState(editing?.recurring ?? false)
  const [newTrip, setNewTrip] = useState(false)
  const [touched, setTouched] = useState(false)

  const { source, trip } = ledgerParts(ledger)
  const isVacation = source === 'vacanze'
  /*
   * Una spesa personale è al 100% di chi la inserisce: le 370 in archivio sono
   * tutte così, e offrire una divisione qui sarebbe offrire un errore.
   */
  const personalOnly = source === 'personali'
  const effectivePreset: SplitPreset = personalOnly ? 'mine' : preset

  const categories = config?.categories ?? []
  const tripCategoryId = config?.tripCategory ?? ''

  /*
   * In un tricount di vacanza la categoria è una sola — «Viaggi» — quindi i
   * riquadri mostrano direttamente le sue sottocategorie: un tocco invece di
   * due, e la torta di ogni viaggio resta divisa per alloggio, trasporti,
   * attività, cibo e souvenir.
   */
  const tripCategory = categories.find((c) => c.id === tripCategoryId)
  const chosenCategory = categories.find((c) => c.id === category)
  const subcategories = chosenCategory?.subcategories ?? []

  const categoryTiles = useMemo<TileOption[]>(
    () => categories.map((c) => ({ value: c.id, label: c.label, emoji: c.emoji })),
    [categories],
  )
  const subTiles = useMemo<TileOption[]>(
    () => subcategories.map((s) => ({ value: s.id, label: s.label })),
    [subcategories],
  )

  const parsedAmount = parseAmount(amount)

  /*
   * I preset parlano dal punto di vista di chi guarda — «tutta mia» per Alessio
   * è «tutta sua» per Federica — mentre `shares` ha due chiavi fisse. La
   * traduzione sta in `sharesFor`, in un posto solo, perché è dove è più facile
   * scambiare le due quote senza che niente si lamenti.
   */
  /* Chi ha pagato serve prima delle quote: il centesimo dispari di una metà va a
     lui, e non a chi guarda. → ADR-0023 */
  /*
   * In «Personale» il controllo non si mostra — le 370 spese personali in
   * archivio sono tutte di chi le ha inserite — ma correggendo una spesa il
   * pagante **si conserva**: una spesa pagata da Federica e portata in
   * «Personale» vuol dire «era tutta mia, e l'ha pagata lei», e riscriverle il
   * pagante cancellerebbe il debito senza dirlo.
   */
  const payer = personalOnly ? (editing?.paidBy ?? person) : paidBy

  const shares = useMemo(() => {
    if (effectivePreset === 'custom') {
      return sharesFor(person, parseAmount(mineText) || 0, parseAmount(theirsText) || 0)
    }
    return splitFor(effectivePreset, Number.isFinite(parsedAmount) ? parsedAmount : 0, payer, person)
  }, [effectivePreset, mineText, parsedAmount, payer, person, theirsText])

  const othersShare = isVacation ? parseAmount(othersText) || 0 : 0

  const draft = useMemo<Expense>(() => {
    const built: Expense = {
      id: editing?.id ?? newExpenseId(date),
      date,
      title: title.trim(),
      amount: Number.isFinite(parsedAmount) ? parsedAmount : Number.NaN,
      shares: toCents(othersShare) > 0 ? { ...shares, others: othersShare } : shares,
      paidBy: payer,
      source,
      category,
      recurring,
    }
    /* Sempre presenti, anche vuoti: un `update` applica solo i campi che porta,
       quindi ometterli vorrebbe dire «lascia com'erano» — e correggendo una
       spesa di vacanza in una spesa di casa il viaggio resterebbe attaccato. */
    built.subcategory = subcategory
    built.trip = isVacation && trip ? trip : ''
    /* Le annotazioni già presenti non si perdono correggendo l'importo. */
    if (editing?.tax730 !== undefined) built.tax730 = editing.tax730
    if (editing?.notes !== undefined) built.notes = editing.notes
    if (editing?.receiptLinks !== undefined) built.receiptLinks = editing.receiptLinks
    if (editing?.welfare !== undefined) built.welfare = editing.welfare
    return built
  }, [
    category,
    date,
    editing,
    isVacation,
    othersShare,
    parsedAmount,
    payer,
    recurring,
    shares,
    source,
    subcategory,
    title,
    trip,
  ])

  const takenIds = useMemo(
    () => new Set((dataset?.expenses ?? []).filter((e) => e.id !== editing?.id).map((e) => e.id)),
    [dataset?.expenses, editing?.id],
  )

  const errors = useMemo(
    () =>
      validateExpense(draft, {
        categories,
        tripIds: (dataset?.trips ?? []).map((t) => t.id),
        takenIds,
      }),
    [categories, dataset?.trips, draft, takenIds],
  )

  const tripIds = useMemo(() => new Set((dataset?.trips ?? []).map((t) => t.id)), [dataset?.trips])

  /**
   * Cambiare tricount azzera quello che non vale più, invece di lasciarlo
   * invisibile a far fallire il salvataggio.
   */
  const changeLedger = (next: string): void => {
    const before = ledgerParts(ledger)
    const after = ledgerParts(next)
    setLedger(next)
    setNewTrip(false)
    if (after.source !== 'vacanze') {
      setOthersText('')
      if (paidBy === 'others') setPaidBy(person)
    }
    /* Entrando o uscendo dalle vacanze la categoria cambia mondo: «Viaggi» non
       ha senso a casa, e «Spesa alimentare» non è una fetta di un viaggio. */
    if ((before.source === 'vacanze') !== (after.source === 'vacanze')) {
      setCategory(after.source === 'vacanze' ? tripCategoryId : '')
      setSubcategory('')
    }
  }

  const createTrip = (candidate: Trip): void => {
    addTrip(candidate)
    setLedger(`vacanze/${candidate.id}`)
    setCategory(tripCategoryId)
    setSubcategory('')
    setNewTrip(false)
    toast.show(`Viaggio «${candidate.name}» creato.`)
  }

  const save = (): void => {
    setTouched(true)
    if (errors.length > 0) return
    if (editing) {
      updateExpense(editing.id, draft)
      toast.show('Spesa corretta.')
    } else {
      addExpense(draft)
      toast.show('Spesa aggiunta.')
    }
    onClose()
  }

  if (!config) return null

  const showErrors = touched && errors.length > 0

  return (
    <div
      className="sheet-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="sheet is-form"
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Correggi la spesa' : 'Nuova spesa'}
      >
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <h2 style={{ fontSize: '1.15rem' }}>{editing ? 'Correggi la spesa' : 'Nuova spesa'}</h2>
          <button type="button" className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Chiudi">
            ✕
          </button>
        </div>

        <div className="sheet-body">
          <div className="stack" style={{ gap: 12 }}>
            <div className="field">
              <label className="label" htmlFor="ef-ledger">
                In quale tricount
              </label>
              {newTrip ? (
                <TripForm
                  takenIds={tripIds}
                  onCreate={createTrip}
                  onCancel={() => setNewTrip(false)}
                  onProblem={(message) => toast.show(message)}
                />
              ) : (
                <div className="row row-inline" style={{ gap: 6 }}>
                  <LedgerSelect
                    id="ef-ledger"
                    value={ledger}
                    trips={dataset?.trips ?? []}
                    sourceLabels={config?.sourceLabels}
                    onChange={changeLedger}
                  />
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setNewTrip(true)}
                    title="Apri un tricount per una vacanza nuova"
                  >
                    Nuova vacanza
                  </button>
                </div>
              )}
            </div>

            <div className="field">
              <label className="label" htmlFor="ef-title">
                Cos'era
              </label>
              <input
                id="ef-title"
                className="input"
                value={title}
                placeholder="Spesa Esselunga"
                autoComplete="off"
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="ef-amount">
                Quanto
              </label>
              <input
                id="ef-amount"
                className="input"
                inputMode="decimal"
                value={amount}
                placeholder="47,30"
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>

            {isVacation && tripCategory ? (
              <div className="field">
                <span className="label">Di che tipo</span>
                <TilePicker
                  ariaLabel="Tipo di spesa del viaggio"
                  options={(tripCategory.subcategories ?? []).map((s) => ({
                    value: s.id,
                    label: s.label,
                  }))}
                  value={subcategory || undefined}
                  onChange={(next) => {
                    setCategory(tripCategoryId)
                    setSubcategory(next ?? '')
                  }}
                />
              </div>
            ) : (
              <>
                <div className="field">
                  <span className="label">Categoria</span>
                  <TilePicker
                    ariaLabel="Categoria della spesa"
                    options={categoryTiles}
                    value={category || undefined}
                    onChange={(next) => {
                      setCategory(next ?? '')
                      setSubcategory('')
                    }}
                  />
                </div>
                {subTiles.length > 0 ? (
                  <div className="field">
                    <span className="label">Di che tipo</span>
                    <TilePicker
                      ariaLabel="Tipo dentro la categoria"
                      options={subTiles}
                      value={subcategory || undefined}
                      onChange={(next) => setSubcategory(next ?? '')}
                    />
                  </div>
                ) : null}
              </>
            )}

            {personalOnly ? (
              <p className="hint">
                Una spesa personale è tutta tua, quindi la divisione non si sceglie.
                {payer !== person
                  ? ` L'ha anticipata ${
                      payer === 'others' ? 'qualcuno del gruppo' : config.people[payer].name
                    }, e resta così: quel debito non sparisce spostando la spesa qui.`
                  : ''}
              </p>
            ) : (
              <>
                <div className="field">
                  <span className="label">Come si divide</span>
                  <Segmented<SplitPreset>
                    ariaLabel="Divisione della spesa"
                    value={preset}
                    onChange={(next) => {
                      setPreset(next)
                      if (next === 'custom') {
                        /* Si parte dalla divisione corrente invece che da zero:
                           quasi sempre si vuole spostare qualche euro, non rifarla. */
                        setMineText(amountText(person === 'me' ? shares.me : shares.partner))
                        setTheirsText(amountText(person === 'me' ? shares.partner : shares.me))
                      }
                    }}
                    options={[
                      { value: 'half', label: SPLIT_LABELS.half },
                      { value: 'mine', label: SPLIT_LABELS.mine },
                      { value: 'theirs', label: SPLIT_LABELS.theirs },
                      { value: 'custom', label: SPLIT_LABELS.custom },
                    ]}
                  />
                </div>

                {preset === 'custom' ? (
                  <div className="form-row">
                    <div className="field">
                      <label className="label" htmlFor="ef-mine">
                        Quota {config.people[person].name}
                      </label>
                      <input
                        id="ef-mine"
                        className="input"
                        inputMode="decimal"
                        value={mineText}
                        onChange={(event) => setMineText(event.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="ef-theirs">
                        Quota {config.people[other].name}
                      </label>
                      <input
                        id="ef-theirs"
                        className="input"
                        inputMode="decimal"
                        value={theirsText}
                        onChange={(event) => setTheirsText(event.target.value)}
                      />
                    </div>
                    {isVacation ? (
                      <div className="field">
                        <label className="label" htmlFor="ef-others">
                          Quota di chi era con voi
                        </label>
                        <input
                          id="ef-others"
                          className="input"
                          inputMode="decimal"
                          value={othersText}
                          onChange={(event) => setOthersText(event.target.value)}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="field">
                  <span className="label">Chi ha pagato</span>
                  <Segmented<Payer>
                    ariaLabel="Chi ha anticipato la spesa"
                    value={paidBy}
                    onChange={setPaidBy}
                    options={[
                      { value: 'me', label: config.people.me.name },
                      { value: 'partner', label: config.people.partner.name },
                      ...(isVacation
                        ? [{ value: 'others' as Payer, label: 'Qualcuno del gruppo' }]
                        : []),
                    ]}
                  />
                </div>
              </>
            )}

            <div className="field">
              <label className="label" htmlFor="ef-date">
                Quando
              </label>
              <input
                id="ef-date"
                className="input"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>

            <label className="checkbox">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(event) => setRecurring(event.target.checked)}
              />
              Spesa fissa, torna ogni mese
            </label>

            {showErrors ? (
              <div className="stack" style={{ gap: 2 }}>
                {errors.map((message) => (
                  <p className="delta is-bad" key={message}>
                    {message}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="sheet-foot">
          <button type="button" className="btn btn-primary" onClick={save}>
            {editing ? 'Salva le correzioni' : 'Aggiungi la spesa'}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Annulla
          </button>
        </div>
      </div>
    </div>
  )
}
