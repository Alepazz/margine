/**
 * Inserire e correggere una spesa dal telefono.
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
  presetOf,
  sharesFor,
  splitFor,
  SOURCE_ORDER,
  validateExpense,
  validateTrip,
  type SplitPreset,
} from '../domain/expense-rules'
import { newExpenseId, newTripId } from '../domain/ids'
import { toCents } from '../domain/money'
import { SOURCE_LABELS, type Expense, type Payer, type Source, type Trip } from '../domain/types'
import { Segmented, useToast } from './ui'

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
  const [source, setSource] = useState<Source>(editing?.source ?? 'condivise')
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
  const [trip, setTrip] = useState(editing?.trip ?? '')
  const [newTrip, setNewTrip] = useState(false)
  const [tripName, setTripName] = useState('')
  const [tripPlace, setTripPlace] = useState('')
  const [tripCountry, setTripCountry] = useState('')
  const [tripStart, setTripStart] = useState(todayIso())
  const [tripEnd, setTripEnd] = useState(todayIso())
  const [touched, setTouched] = useState(false)

  const isVacation = source === 'vacanze'
  /*
   * Una spesa personale è al 100% di chi la inserisce: le 370 in archivio sono
   * tutte così, e offrire una divisione qui sarebbe offrire un errore.
   */
  const personalOnly = source === 'personali'
  const effectivePreset: SplitPreset = personalOnly ? 'mine' : preset

  const categories = config?.categories ?? []
  const chosenCategory = categories.find((c) => c.id === category)
  const subcategories = chosenCategory?.subcategories ?? []

  const parsedAmount = parseAmount(amount)

  /*
   * I preset parlano dal punto di vista di chi guarda — «tutta mia» per Alessio
   * è «tutta sua» per Federica — mentre `shares` ha due chiavi fisse. La
   * traduzione sta in `sharesFor`, in un posto solo, perché è dove è più facile
   * scambiare le due quote senza che niente si lamenti.
   */
  /* Chi ha pagato serve prima delle quote: il centesimo dispari di una metà va a
     lui, e non a chi guarda. → ADR-0023 */
  const payer = personalOnly ? person : paidBy

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
    if (subcategory) built.subcategory = subcategory
    if (isVacation && trip) built.trip = trip
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
    person,
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

  const createTrip = () => {
    const year = Number(tripStart.slice(0, 4))
    const candidate = {
      id: newTripId(tripName, Number.isFinite(year) ? year : new Date().getUTCFullYear(), tripIds),
      name: tripName.trim(),
      place: tripPlace.trim(),
      country: tripCountry.trim() || undefined,
      year,
      start: tripStart,
      end: tripEnd,
    }
    const problems = validateTrip(candidate, tripIds)
    if (problems.length > 0) {
      toast.show(problems[0] ?? 'Il viaggio non è valido.')
      return
    }
    addTrip(candidate as Trip)
    setTrip(candidate.id)
    setNewTrip(false)
    toast.show(`Viaggio «${candidate.name}» creato.`)
  }

  const save = () => {
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
        className="sheet"
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

        <div className="stack" style={{ gap: 12 }}>
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

          <div className="form-row">
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
          </div>

          <div className="field">
            <label className="label" htmlFor="ef-source">
              In quale registro
            </label>
            <select
              id="ef-source"
              className="select"
              value={source}
              onChange={(event) => {
                const next = event.target.value as Source
                setSource(next)
                /* Cambiando registro le scelte che non valgono più si azzerano,
                   invece di restare invisibili e far fallire il salvataggio. */
                if (next !== 'vacanze') {
                  setTrip('')
                  setNewTrip(false)
                  setOthersText('')
                  if (paidBy === 'others') setPaidBy(person)
                }
              }}
            >
              {SOURCE_ORDER.map((value) => (
                <option key={value} value={value}>
                  {SOURCE_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          {isVacation ? (
            <div className="field">
              <span className="label">Quale viaggio</span>
              {newTrip ? (
                <div className="stack" style={{ gap: 8 }}>
                  <div className="form-row">
                    <input
                      className="input"
                      value={tripName}
                      placeholder="Nome (Sicilia)"
                      aria-label="Nome del viaggio"
                      onChange={(event) => setTripName(event.target.value)}
                    />
                    <input
                      className="input"
                      value={tripPlace}
                      placeholder="Posto (Palermo)"
                      aria-label="Posto"
                      onChange={(event) => setTripPlace(event.target.value)}
                    />
                  </div>
                  <input
                    className="input"
                    value={tripCountry}
                    placeholder="Paese (facoltativo)"
                    aria-label="Paese"
                    onChange={(event) => setTripCountry(event.target.value)}
                  />
                  <div className="form-row">
                    <input
                      className="input"
                      type="date"
                      value={tripStart}
                      aria-label="Data di partenza"
                      onChange={(event) => setTripStart(event.target.value)}
                    />
                    <input
                      className="input"
                      type="date"
                      value={tripEnd}
                      aria-label="Data di ritorno"
                      onChange={(event) => setTripEnd(event.target.value)}
                    />
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={createTrip}>
                      Crea il viaggio
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => setNewTrip(false)}>
                      Annulla
                    </button>
                  </div>
                </div>
              ) : (
                <div className="row" style={{ gap: 6 }}>
                  <select
                    className="select"
                    style={{ flex: '1 1 auto' }}
                    value={trip}
                    aria-label="Viaggio"
                    onChange={(event) => setTrip(event.target.value)}
                  >
                    <option value="">Scegli…</option>
                    {(dataset?.trips ?? [])
                      .slice()
                      .sort((a, b) => (a.start < b.start ? 1 : -1))
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} {t.year}
                        </option>
                      ))}
                  </select>
                  <button type="button" className="btn btn-sm" onClick={() => setNewTrip(true)}>
                    Nuovo
                  </button>
                </div>
              )}
            </div>
          ) : null}

          <div className="form-row">
            <div className="field">
              <label className="label" htmlFor="ef-category">
                Categoria
              </label>
              <select
                id="ef-category"
                className="select"
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value)
                  setSubcategory('')
                }}
              >
                <option value="">Scegli…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.emoji ? `${c.emoji} ` : ''}
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            {subcategories.length > 0 ? (
              <div className="field">
                <label className="label" htmlFor="ef-sub">
                  Di che tipo
                </label>
                <select
                  id="ef-sub"
                  className="select"
                  value={subcategory}
                  onChange={(event) => setSubcategory(event.target.value)}
                >
                  <option value="">Nessuna</option>
                  {subcategories.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          {personalOnly ? (
            <p className="hint">
              Una spesa personale è tutta tua: divisione e chi ha pagato non si scelgono.
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

          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={save}>
              {editing ? 'Salva le correzioni' : 'Aggiungi la spesa'}
            </button>
            <button type="button" className="btn" onClick={onClose}>
              Annulla
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
