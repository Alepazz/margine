/**
 * Inserire e correggere una spesa dal telefono.
 *
 * L'ordine dei campi è quello in cui si pensa una spesa: **prima il tricount**,
 * perché è lui a decidere tutto il resto — se c'è una divisione da scegliere, se
 * esiste una quota di terzi, quali categorie hanno senso — poi cos'era, quanto,
 * di che tipo, come si divide, e per ultima la data, che nove volte su dieci è
 * oggi e non si tocca.
 *
 * Il tricount si sceglie da una **tendina** (`LedgerSelect`), e la fila di chip
 * provata il 22/08/2026 è stata rimossa: costava tre righe di altezza prima di
 * «Cos'era» e «Quanto» — i due campi che si scrivono ogni volta — per mostrare
 * alternative che in una spesa non si scelgono. Una riga alta una riga vince.
 * → ADR-0045
 *
 * La divisione si dichiara dicendo **chi partecipa**: due caselle, una per
 * persona, con accanto quanto tocca a ciascuno. Le tre divisioni che esistono
 * davvero — metà, tutta tua, tutta sua — sono le tre combinazioni di due
 * caselle, quindi non serve nominarle; e «a mano» resta per il caso che non è
 * ancora capitato. → ADR-0032
 *
 * Le regole di validità sono quelle di `domain/expense-rules.ts`, le stesse che
 * l'import applica alla sessione mensile: qui si vedono mentre si sbaglia, là
 * fermano il file prima che venga cifrato. → ADR-0018
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { useStore } from '../data/store'
import { todayIso } from '../domain/dates'
import {
  presetOf,
  sharesFor,
  splitFor,
  tricountOptions,
  validateExpense,
  type SplitPreset,
} from '../domain/expense-rules'
import { newCategoryId, newExpenseId } from '../domain/ids'
import { formatEuro, toCents } from '../domain/money'
import {
  soleMemberOf,
  titleOf,
  type Category,
  type Expense,
  type Payer,
  type PersonId,
  type Tricount,
} from '../domain/types'
import { LedgerSelect } from './LedgerSelect'
import { TricountForm } from './TricountForm'
import { AmountInput, NameFields, Segmented, useScrollLock, useToast } from './ui'

/** Accetta la virgola: sulla tastiera del telefono è quello che esce. */
function parseAmount(text: string): number {
  const normalised = text.trim().replace(',', '.')
  if (normalised === '') return Number.NaN
  return Math.round(Number(normalised) * 100) / 100
}

function amountText(value: number): string {
  return value.toFixed(2).replace('.', ',')
}

/** Valore riservato nella tendina delle categorie: non è un id, è un comando. */
const NEW_CATEGORY = '__nuova__'

export function ExpenseForm({
  expense: editing,
  onClose,
}: {
  /** Presente = si sta correggendo una spesa che esiste. */
  expense?: Expense
  onClose: () => void
}): ReactNode {
  const { config, dataset, view, addExpense, updateExpense, addTricount, setCategories } = useStore()
  const toast = useToast()
  const person = view.person
  const other = person === 'me' ? 'partner' : 'me'

  const [title, setTitle] = useState(editing?.title ?? '')
  const [amount, setAmount] = useState(editing ? amountText(editing.amount) : '')
  const [date, setDate] = useState(editing?.date ?? todayIso())
  /* Il primo tricount **suo**: non un id cablato, che potrebbe essere di un
     tricount di cui chi inserisce non è nemmeno membro. */
  const [ledger, setLedger] = useState<string>(() => {
    if (editing) return editing.tricount
    const first = tricountOptions(dataset?.tricounts ?? [], view.person)[0]
    return first?.tricount.id ?? ''
  })
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
  const [tax730, setTax730] = useState(editing?.tax730 ?? false)
  const [welfare, setWelfare] = useState(editing?.welfare ?? false)
  /*
   * Il capitale: rogito, caparra, notaio. **Spenta di partenza**, anche dentro
   * un progetto, ed è una scelta fra due guasti. Dimenticarla su un rogito
   * manda a picco il mese e lo vedi in un secondo; dimenticare di spegnerla su
   * un frigo lo farebbe sparire in silenzio da ogni media, per sempre. Fra un
   * guasto rumoroso e uno muto si sceglie il rumoroso — è la ferita di
   * ADR-0057 al contrario. → ADR-0079
   */
  const [offBudget, setOffBudget] = useState(editing?.offBudget ?? false)
  const [newTrip, setNewTrip] = useState(false)
  const [newCategory, setNewCategory] = useState(false)
  const [catEmoji, setCatEmoji] = useState('')
  const [catLabel, setCatLabel] = useState('')
  const [touched, setTouched] = useState(false)
  const sheetRef = useRef<HTMLDivElement | null>(null)

  useScrollLock()

  useEffect(() => {
    sheetRef.current?.focus()
  }, [])

  const tricounts = dataset?.tricounts ?? []
  const chosenTricount = tricounts.find((t) => t.id === ledger)
  const isVacation = chosenTricount?.trip !== undefined
  /* Un progetto: solo qui la casella «fuori dai conti del mese» ha senso. */
  const isProgetto = chosenTricount?.project === true
  /*
   * In un tricount con un membro solo la spesa è al 100% di quel membro: le 370
   * in archivio sono tutte così, e offrire una divisione qui sarebbe offrire un
   * errore. Non «di chi inserisce»: del **membro** — è il tricount a dirlo.
   * → ADR-0037
   */
  const soleMember = soleMemberOf(chosenTricount)
  const personalOnly = soleMember !== undefined

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

  /*
   * Il welfare appartiene a **chi ha anticipato**: toglie l'uscita dal budget di
   * quella persona e non dell'altra, quindi la spunta si offre solo se hai
   * anticipato tu — è la stessa condizione del foglio di dettaglio. Sulla spesa
   * anticipata da qualcun altro il flag già presente **si conserva**: correggere
   * un importo non è il gesto con cui si smentisce il welfare di chi l'ha
   * pagata. → ADR-0014
   */
  const welfareMine = payer === person
  const welfareFlag = welfareMine ? welfare : (editing?.welfare ?? false)

  const shares = useMemo(() => {
    /* Tutta del membro unico, chiunque stia guardando. */
    if (soleMember) {
      const whole = Number.isFinite(parsedAmount) ? parsedAmount : 0
      return { me: soleMember === 'me' ? whole : 0, partner: soleMember === 'partner' ? whole : 0 }
    }
    if (preset === 'custom') {
      return sharesFor(person, parseAmount(mineText) || 0, parseAmount(theirsText) || 0)
    }
    return splitFor(preset, Number.isFinite(parsedAmount) ? parsedAmount : 0, payer, person)
  }, [mineText, parsedAmount, payer, person, preset, soleMember, theirsText])

  const othersShare = isVacation ? parseAmount(othersText) || 0 : 0

  /*
   * Le caselle non sono uno stato a parte: sono la lettura del preset. Così una
   * combinazione impossibile — nessuno dei due partecipa — non esiste, invece di
   * esistere e dover essere respinta.
   */
  const manual = preset === 'custom'
  const mineOn = preset === 'half' || preset === 'mine'
  const theirsOn = preset === 'half' || preset === 'theirs'

  /** Togliere la spunta all'unico che partecipa non fa niente: qualcuno deve pagarla. */
  const toggleShare = (which: 'mine' | 'theirs'): void => {
    if (which === 'mine') setPreset(mineOn ? (theirsOn ? 'theirs' : 'mine') : theirsOn ? 'half' : 'mine')
    else setPreset(theirsOn ? (mineOn ? 'mine' : 'theirs') : mineOn ? 'half' : 'theirs')
  }

  const draft = useMemo<Expense>(() => {
    const built: Expense = {
      id: editing?.id ?? newExpenseId(date),
      date,
      title: title.trim(),
      amount: Number.isFinite(parsedAmount) ? parsedAmount : Number.NaN,
      shares: toCents(othersShare) > 0 ? { ...shares, others: othersShare } : shares,
      paidBy: payer,
      tricount: ledger,
      category,
      recurring,
    }
    /* Sempre presente, anche vuota: un `update` applica solo i campi che porta,
       quindi ometterla vorrebbe dire «lascia com'era». */
    built.subcategory = subcategory
    /*
     * I due flag li scrive il modulo, e sempre come booleani: `normalize()`
     * nella coda cancella la chiave quando il valore è falso, quindi lo stesso
     * campo serve ad accendere il flag e a spegnerlo. Ometterlo invece vorrebbe
     * dire «lascia com'era», e togliere una spunta non farebbe niente.
     */
    built.tax730 = tax730
    built.welfare = welfareFlag
    /* Come gli altri due, e per la stessa ragione: sempre un booleano, o
       togliere la spunta non farebbe niente. Fuori da un progetto è per forza
       falso — la casella non c'è e il dominio lo rifiuterebbe. */
    built.offBudget = isProgetto ? offBudget : false
    /* Le altre annotazioni non si mettono da qui e non si perdono correggendo
       l'importo: si scrivono nel foglio di dettaglio. */
    if (editing?.notes !== undefined) built.notes = editing.notes
    if (editing?.receiptLinks !== undefined) built.receiptLinks = editing.receiptLinks
    return built
  }, [
    category,
    date,
    editing,
    ledger,
    othersShare,
    parsedAmount,
    payer,
    recurring,
    shares,
    subcategory,
    tax730,
    title,
    welfareFlag,
    offBudget,
    isProgetto,
  ])

  const takenIds = useMemo(
    () => new Set((dataset?.expenses ?? []).filter((e) => e.id !== editing?.id).map((e) => e.id)),
    [dataset?.expenses, editing?.id],
  )

  const errors = useMemo(
    () => validateExpense(draft, { categories, tricounts, takenIds }),
    [categories, draft, takenIds, tricounts],
  )

  const tricountIds = useMemo(() => new Set(tricounts.map((t) => t.id)), [tricounts])

  /**
   * Cambiare tricount azzera quello che non vale più, invece di lasciarlo
   * invisibile a far fallire il salvataggio.
   */
  const changeLedger = (next: string): void => {
    const wasVacation = isVacation
    const willBeVacation = tricounts.find((t) => t.id === next)?.trip !== undefined
    setLedger(next)
    setNewTrip(false)
    if (!willBeVacation) {
      setOthersText('')
      if (paidBy === 'others') setPaidBy(person)
    }
    /* Entrando o uscendo dalle vacanze la categoria cambia mondo: «Viaggi» non
       ha senso a casa, e «Spesa alimentare» non è una fetta di un viaggio. */
    if (wasVacation !== willBeVacation) {
      setCategory(willBeVacation ? tripCategoryId : '')
      setSubcategory('')
    }
  }

  /** Creare una categoria senza uscire dal modulo, e trovarsela già scelta. */
  const createCategory = (): void => {
    const trimmed = catLabel.trim()
    if (trimmed === '') {
      toast.show('Serve un nome per la categoria.')
      return
    }
    const taken = new Set(categories.map((c) => c.id))
    const created: Category = { id: newCategoryId(trimmed, taken), label: trimmed }
    if (catEmoji.trim()) created.emoji = catEmoji.trim()
    setCategories([...categories, created])
    setCategory(created.id)
    setSubcategory('')
    setNewCategory(false)
    setCatEmoji('')
    setCatLabel('')
    toast.show(`Categoria «${trimmed}» creata e scelta.`)
  }

  const createTrip = (candidate: Tricount): void => {
    addTricount(candidate)
    setLedger(candidate.id)
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
      {/* Il fuoco entra nel foglio, come negli altri tre: era l'unico a
          lasciarlo sul pulsante dietro il velo, quindi un dialogo che si dichiara
          modale non aveva niente da leggere per chi usa la voce e `Tab`
          continuava a scorrere la pagina sotto. Sul contenitore e non su un
          campo: dare il fuoco a un campo di testo fa saltare su la tastiera. */}
      <div
        className="sheet is-form"
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Correggi la spesa' : 'Nuova spesa'}
        tabIndex={-1}
        ref={sheetRef}
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
                <TricountForm
                  takenIds={tricountIds}
                  vacation
                  onCreate={createTrip}
                  onCancel={() => setNewTrip(false)}
                  onProblem={(message) => toast.show(message)}
                />
              ) : (
                <div className="row row-inline" style={{ gap: 6 }}>
                  <LedgerSelect
                    id="ef-ledger"
                    value={ledger}
                    tricounts={tricounts}
                    person={person}
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
              <AmountInput id="ef-amount" value={amount} onChange={setAmount} placeholder="47,30" />
            </div>

            {isVacation && tripCategory ? (
              <div className="field">
                <label className="label" htmlFor="ef-subtrip">
                  Di che tipo
                </label>
                <select
                  id="ef-subtrip"
                  className="select"
                  value={subcategory}
                  onChange={(event) => {
                    setCategory(tripCategoryId)
                    setSubcategory(event.target.value)
                  }}
                >
                  <option value="">Scegli…</option>
                  {(tripCategory.subcategories ?? []).map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div className="field">
                  <label className="label" htmlFor="ef-category">
                    Categoria
                  </label>
                  {/*
                   * Tendina e non riquadri, con l'ultima voce che ne crea una: è
                   * quello che serve quando ti accorgi a metà inserimento che la
                   * categoria giusta non c'è, e non vuoi uscire dal modulo per
                   * andarla a creare in Impostazioni. → ADR-0031
                   */}
                  <select
                    id="ef-category"
                    className="select"
                    value={category}
                    onChange={(event) => {
                      const next = event.target.value
                      if (next === NEW_CATEGORY) {
                        setNewCategory(true)
                        return
                      }
                      setNewCategory(false)
                      setCategory(next)
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
                    <option value={NEW_CATEGORY}>➕ Nuova categoria…</option>
                  </select>
                  {newCategory ? (
                    <div className="stack" style={{ gap: 6, marginTop: 6 }}>
                      <NameFields
                        emoji={catEmoji}
                        label={catLabel}
                        onEmoji={setCatEmoji}
                        onLabel={setCatLabel}
                        what="della nuova categoria"
                        emojiHint="🎈"
                        labelHint="Come si chiama"
                      />
                      <div className="row row-inline" style={{ gap: 6 }}>
                        <button type="button" className="btn btn-primary btn-sm" onClick={createCategory}>
                          Crea e scegli
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => setNewCategory(false)}
                        >
                          Annulla
                        </button>
                      </div>
                      <p className="hint">
                        Nasce senza colore: nei grafici finisce in «Altre voci» finché non gliene
                        dai uno da Impostazioni.
                      </p>
                    </div>
                  ) : null}
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
                      <option value="">Nessuno</option>
                      {subcategories.map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {sub.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </>
            )}

            {personalOnly ? (
              <p className="hint">
                {soleMember === person
                  ? 'Una spesa personale è tutta tua, quindi la divisione non si sceglie.'
                  : `Questo tricount è personale di ${config?.people[soleMember ?? 'me'].name}: la spesa è tutta sua.`}
                {payer !== person
                  ? ` L'ha anticipata ${
                      payer === 'others' ? 'qualcuno del gruppo' : config.people[payer].name
                    }, e resta così: quel debito non sparisce spostando la spesa qui.`
                  : ''}
              </p>
            ) : (
              <>
                <div className="field">
                  <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                    <span className="label" id="ef-split-label">
                      Come si divide
                    </span>
                    <select
                      className="select"
                      style={{ width: 'auto' }}
                      aria-label="Modo di dividere"
                      value={manual ? 'manual' : 'even'}
                      onChange={(event) => {
                        if (event.target.value === 'manual') {
                          /* Si parte dalla divisione corrente invece che da zero:
                             quasi sempre si vuole spostare qualche euro, non rifarla. */
                          setMineText(amountText(person === 'me' ? shares.me : shares.partner))
                          setTheirsText(amountText(person === 'me' ? shares.partner : shares.me))
                          setPreset('custom')
                        } else {
                          setPreset('half')
                        }
                      }}
                    >
                      <option value="even">In parti uguali</option>
                      <option value="manual">A mano</option>
                    </select>
                  </div>

                  {/*
                   * Chi partecipa, non «che divisione è»: le tre divisioni reali
                   * sono le tre combinazioni di due caselle, e accanto a ognuna
                   * c'è quanto le tocca — che è il numero che si vuole vedere
                   * prima di salvare. → ADR-0032
                   */}
                  <div className="split-list" role="group" aria-labelledby="ef-split-label">
                    {([person, other] as PersonId[]).map((who) => {
                      const on = who === person ? mineOn : theirsOn
                      const quota = who === 'me' ? shares.me : shares.partner
                      /* «(tu)» sta solo accanto a chi ha l'app in mano: è la
                         stessa distinzione che fa Tricount con «(Me)». */
                      const name = (
                        <span className="split-name">
                          {titleOf({ name: config.people[who].name, emoji: config.people[who].emoji })}
                          {who === person ? ' (tu)' : ''}
                        </span>
                      )
                      return (
                        <div className="split-row" key={who}>
                          {manual ? (
                            <>
                              {name}
                              <AmountInput
                                value={who === person ? mineText : theirsText}
                                onChange={who === person ? setMineText : setTheirsText}
                                ariaLabel={`Quota di ${config.people[who].name}`}
                              />
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="split-check"
                                aria-pressed={on}
                                onClick={() => toggleShare(who === person ? 'mine' : 'theirs')}
                              >
                                <span className="split-box" aria-hidden="true">
                                  {on ? '✓' : ''}
                                </span>
                                {name}
                              </button>
                              <span className="num split-amount">
                                {on ? formatEuro(quota) : '—'}
                              </span>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {manual && isVacation ? (
                    <div className="field" style={{ marginTop: 6 }}>
                      <label className="label" htmlFor="ef-others">
                        Quota di chi era con voi
                      </label>
                      <AmountInput id="ef-others" value={othersText} onChange={setOthersText} />
                    </div>
                  ) : null}
                </div>

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

            {/* Le due annotazioni che prima si mettevano solo dopo, aprendo la
                spesa dall'elenco: la commercialista e il welfare si sanno
                mentre si inserisce, non il mese dopo. Restano modificabili dal
                foglio di dettaglio, che è dove si aggiungono nota e scontrino. */}
            <label className="checkbox">
              <input
                type="checkbox"
                checked={tax730}
                onChange={(event) => setTax730(event.target.checked)}
              />
              Da scaricare nel 730
            </label>

            {welfareMine ? (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={welfare}
                  onChange={(event) => setWelfare(event.target.checked)}
                />
                Pagata col welfare aziendale
              </label>
            ) : null}

            {/* Solo dentro un progetto: fuori non c'è nessuna pagina che
                rimetta sotto gli occhi una spesa tolta dai conti, e il dominio
                la rifiuta. → ADR-0079 */}
            {isProgetto ? (
              <div className="field">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={offBudget}
                    onChange={(event) => setOffBudget(event.target.checked)}
                  />
                  Fuori dai conti del mese
                </label>
                <p className="hint">
                  {offBudget
                    ? 'Capitale: non entra in margine, medie e confronti, e il suo debito sta nella pagina del progetto invece che nel saldo di ogni giorno.'
                    : 'Da spuntare per rogito, caparra, notaio, agenzia. La rata del mutuo e le spese di casa no: quelle sono la vita di ogni mese.'}
                </p>
              </div>
            ) : null}

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
