/**
 * Le regole che una spesa deve rispettare, controllate nel browser.
 *
 * Esistono già in `scripts/lib/validate-core.mjs`, che è il cancello della
 * sessione mensile. Sono due implementazioni della stessa cosa, come per la
 * cifratura — e come per la cifratura c'è un test che prova che concordano:
 * `scripts/lib/expense-rules-parity.test.mjs`.
 *
 * La garanzia che il test presidia è in una direzione sola, ed è quella che
 * conta: **ciò che l'app accetta, l'import lo accetta senza errori.** Il
 * contrario non vale di proposito — l'import tollera con un avviso un importo a
 * zero o una sottocategoria fuori tassonomia, mentre un modulo di inserimento
 * non deve permetterli affatto.
 *
 * I messaggi sono quelli che leggi nel modulo, quindi sono scritti per essere
 * letti mentre stai sbagliando: dicono cosa fare, non cosa è formalmente rotto.
 */

import { toCents } from './money'
import type { Category, Expense, Payer, PersonId, Source, Trip } from './types'
import { SOURCES, sourceLabelOf } from './types'

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const PAYERS = new Set(['me', 'partner', 'others'])

/**
 * La forma non basta: `2026-02-31` supera la regex e non esiste. Il calendario
 * lo sa solo `Date`, quindi si costruisce la data e si controlla che non sia
 * stata riportata avanti da sé.
 */
function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

export interface RulesContext {
  categories: readonly Category[]
  /** I viaggi che esistono: una spesa di vacanza deve puntare a uno di questi. */
  tripIds: readonly string[]
  /** Gli id già presi, per non creare un doppione silenzioso. */
  takenIds: ReadonlySet<string>
}

/** Errori bloccanti. Vuoto = si può salvare. */
export function validateExpense(expense: Expense, ctx: RulesContext): string[] {
  const errors: string[] = []

  if (!expense.id) errors.push('Manca l’identificativo della spesa.')
  else if (ctx.takenIds.has(expense.id)) errors.push('Esiste già una spesa con questo identificativo.')

  if (!isRealDate(expense.date)) errors.push('La data non è valida.')

  if (expense.title.trim() === '') errors.push('Serve una descrizione: è come la ritroverai.')

  if (!Number.isFinite(expense.amount)) errors.push('L’importo non è un numero.')
  else if (toCents(expense.amount) <= 0) errors.push('L’importo deve essere maggiore di zero.')
  else if (Math.abs(expense.amount * 100 - toCents(expense.amount)) > 1e-6) {
    errors.push('L’importo può avere al massimo due decimali.')
  }

  const me = expense.shares.me
  const partner = expense.shares.partner
  const others = expense.shares.others
  const parts: [string, number | undefined][] = [
    ['tua', me],
    ['dell’altra persona', partner],
    ['di chi era con voi', others],
  ]
  let sum = 0
  for (const [label, value] of parts) {
    if (value === undefined) continue
    if (!Number.isFinite(value) || value < 0) errors.push(`La quota ${label} non è valida.`)
    else sum += toCents(value)
  }
  if (typeof me !== 'number' || typeof partner !== 'number') {
    errors.push('Mancano le quote.')
  } else if (Number.isFinite(expense.amount) && sum !== toCents(expense.amount)) {
    /*
     * L'invariante di ADR-0007 e ADR-0012: le quote sommano **esattamente**
     * all'importo, in centesimi. È il controllo che rende riconciliabili i dati.
     */
    errors.push(
      `Le quote sommano ${(sum / 100).toFixed(2)} € ma l’importo è ${expense.amount.toFixed(2)} €.`,
    )
  }

  if (!PAYERS.has(expense.paidBy)) errors.push('Manca chi ha pagato.')
  if (!SOURCES.includes(expense.source)) errors.push('Manca il registro.')
  if (typeof expense.recurring !== 'boolean') errors.push('«Ricorrente» deve essere sì o no.')

  const category = ctx.categories.find((c) => c.id === expense.category)
  if (!category) {
    errors.push('Manca la categoria.')
  } else if (expense.subcategory) {
    const allowed = category.subcategories ?? []
    if (allowed.length > 0 && !allowed.some((s) => s.id === expense.subcategory)) {
      errors.push('La sottocategoria non appartiene a questa categoria.')
    }
  }

  if (expense.source === 'vacanze') {
    if (!expense.trip) errors.push('Una spesa di vacanza deve appartenere a un viaggio.')
    else if (!ctx.tripIds.includes(expense.trip)) errors.push('Questo viaggio non esiste.')
  } else if (expense.trip) {
    errors.push('Solo le spese di vacanza appartengono a un viaggio.')
  }

  if (others !== undefined && toCents(others) > 0 && expense.source !== 'vacanze') {
    errors.push('La quota di terzi esiste solo nelle spese di vacanza.')
  }

  if (expense.welfare === true && expense.paidBy === 'others') {
    errors.push('Il welfare è di chi paga: non si applica a un conto anticipato da altri.')
  }

  for (const link of expense.receiptLinks ?? []) {
    if (!/^https?:\/\//.test(link)) errors.push(`Link allo scontrino non valido: ${link}`)
  }

  return errors
}

export interface TripDraft {
  id: string
  name: string
  place: string
  country?: string
  year: number
  start: string
  end: string
}

export function validateTrip(trip: TripDraft, takenIds: ReadonlySet<string>): string[] {
  const errors: string[] = []
  if (!trip.id) errors.push('Manca l’identificativo del viaggio.')
  else if (takenIds.has(trip.id)) errors.push('Esiste già un viaggio con questo identificativo.')
  if (trip.name.trim() === '') errors.push('Serve un nome per il viaggio.')
  if (trip.place.trim() === '') errors.push('Serve un posto.')
  if (!isRealDate(trip.start)) errors.push('La data di partenza non è valida.')
  if (!isRealDate(trip.end)) errors.push('La data di ritorno non è valida.')
  if (isRealDate(trip.start) && isRealDate(trip.end) && trip.end < trip.start) {
    errors.push('Il viaggio finisce prima di cominciare.')
  }
  if (isRealDate(trip.start) && trip.year !== Number(trip.start.slice(0, 4))) {
    errors.push('L’anno non coincide con la data di partenza.')
  }
  return errors
}

/**
 * Le tre divisioni che esistono davvero: in due anni di dati non ne sono state
 * usate altre. Il modulo offre queste come pulsanti e la quarta a mano, invece
 * di chiedere di comporre due numeri che devono sommare all'importo.
 */
export type SplitPreset = 'half' | 'mine' | 'theirs' | 'custom'

/**
 * Le due quote di una spesa, sulle **chiavi fisse** di `shares`.
 *
 * Prende sia chi guarda — «tutta mia» vuol dire cose diverse per i due — sia chi
 * ha pagato, e restituisce direttamente `{ me, partner }`: una traduzione sola
 * invece di due, nel punto del progetto dove è più facile scambiare le quote.
 *
 * **Il centesimo dispari va a chi ha pagato**, come fa Tricount quando calcola
 * chi deve cosa a chi. Prima andava «a chi guarda», e quella era una regola
 * sbagliata due volte: divergeva da Tricount di un centesimo per voce — 81 su un
 * tricount solo — e faceva dividere la *stessa* spesa in due modi diversi
 * secondo chi aveva l'app in mano. → ADR-0023
 */
export function splitFor(
  preset: SplitPreset,
  amount: number,
  paidBy: Payer,
  person: PersonId,
): { me: number; partner: number } {
  const cents = toCents(amount)
  const other: PersonId = person === 'me' ? 'partner' : 'me'
  const all = (who: PersonId) => ({ me: who === 'me' ? amount : 0, partner: who === 'partner' ? amount : 0 })
  switch (preset) {
    case 'mine':
      return all(person)
    case 'theirs':
      return all(other)
    case 'half': {
      /* Cinque centesimi non si dividono in due: uno dei due prende quello in
         più, e quel qualcuno è chi ha tirato fuori i soldi. Un pagante fuori
         dalla coppia lo lascia a `partner` per convenzione — conta solo che la
         regola non dipenda da chi guarda. */
      const low = Math.floor(cents / 2)
      const mine = paidBy === 'me' ? cents - low : low
      return { me: mine / 100, partner: (cents - mine) / 100 }
    }
    case 'custom':
      return { me: 0, partner: 0 }
  }
}

/**
 * Che divisione è, guardando una spesa che esiste già.
 *
 * Dipende da **chi guarda**: «tutta mia» per Alessio è «tutta sua» per Federica.
 * I preset parlano sempre dal punto di vista di chi ha l'app in mano, mentre
 * `shares` ha due chiavi fisse — ed è il posto dove è più facile confondersi.
 */
export function presetOf(expense: Expense, person: PersonId): SplitPreset {
  if (toCents(expense.shares.others ?? 0) > 0) return 'custom'
  const amount = toCents(expense.amount)
  const mine = toCents(person === 'me' ? expense.shares.me : expense.shares.partner)
  const theirs = toCents(person === 'me' ? expense.shares.partner : expense.shares.me)
  if (mine === amount && theirs === 0) return 'mine'
  if (theirs === amount && mine === 0) return 'theirs'
  if (Math.abs(mine - theirs) <= 1 && mine + theirs === amount) return 'half'
  return 'custom'
}

/** Dal punto di vista di chi guarda alle due chiavi fisse di `shares`. */
export function sharesFor(
  person: PersonId,
  mine: number,
  theirs: number,
): { me: number; partner: number } {
  return person === 'me' ? { me: mine, partner: theirs } : { me: theirs, partner: mine }
}

/** I tricount fissi del menù, nell'ordine in cui si usano. `vacanze` non c'è: lì ci sono i viaggi. */
export const LEDGER_SOURCES: readonly Source[] = ['condivise', 'personali', 'fisse']

/**
 * I tricount fra cui scegliere, come lista piatta: i tre fissi più le vacanze
 * **aperte**, dalla più recente.
 *
 * `current` è il tricount della spesa che si sta correggendo, e c'è per una
 * ragione precisa: una spesa di due anni fa appartiene a una vacanza conclusa,
 * e un menù che non la contiene non può rappresentare il valore che ha. La
 * conseguenza sarebbe che aprire quella spesa la sposterebbe di tricount da
 * sola, senza che nessuno l'abbia chiesto. → ADR-0027
 */
export function ledgerOptions(
  trips: readonly Trip[],
  opts: { current?: string } = {},
): { key: string; trip?: Trip; closed: boolean }[] {
  const out: { key: string; trip?: Trip; closed: boolean }[] = LEDGER_SOURCES.map((source) => ({
    key: source,
    closed: false,
  }))

  const ordered = [...trips].sort((a, b) => (a.start < b.start ? 1 : -1))
  for (const trip of ordered) {
    const key = `vacanze/${trip.id}`
    if (trip.closed === true && key !== opts.current) continue
    out.push({ key, trip, closed: trip.closed === true })
  }
  return out
}

/**
 * Il tricount in cui sta una spesa, come **una scelta sola**.
 *
 * Su Tricount i gruppi sono una lista piatta e ogni vacanza è un gruppo a sé:
 * chiedere prima il «registro» e poi il viaggio è una domanda in più che nella
 * testa di chi inserisce non esiste.
 *
 * La chiave — `fisse` | `personali` | `condivise` | `vacanze/<idViaggio>` — è
 * **la stessa** con cui il saldo raggruppa i tricount: `coupleBalance` chiama
 * `ledgerKeyOf` e le chiavi di `balance.groups` sono queste. Un formato nuovo
 * sarebbe un secondo modo di dire la stessa cosa, e i due divergerebbero al
 * primo viaggio con un id strano. → ADR-0026
 */
export type LedgerKey = string

/** Da una chiave di tricount ai due campi che finiscono nella spesa. */
export function ledgerParts(key: LedgerKey): { source: Source; trip?: string } {
  if (key.startsWith('vacanze/')) {
    const trip = key.slice('vacanze/'.length)
    return trip ? { source: 'vacanze', trip } : { source: 'vacanze' }
  }
  return { source: key as Source }
}

/** E il verso opposto, dalla spesa alla chiave. */
export function ledgerKeyOf(expense: { source: Source; trip?: string }): LedgerKey {
  return expense.source === 'vacanze' && expense.trip ? `vacanze/${expense.trip}` : expense.source
}

/**
 * Il nome leggibile di un tricount, da mostrare.
 *
 * Per una vacanza il nome sta nei dati del viaggio e non nella chiave, quindi
 * serve l'elenco dei viaggi. Sta qui, in un posto solo, perché lo vogliono la
 * pagina Saldo e il pannello che sposta una spesa: scritto due volte, il giorno
 * che un viaggio viene rinominato uno dei due mostrerebbe ancora l'id.
 */
export function ledgerLabel(
  key: LedgerKey,
  trips: readonly Trip[],
  sourceLabels: Partial<Record<Source, string>> | undefined,
): string {
  const { source, trip } = ledgerParts(key)
  if (trip) return trips.find((candidate) => candidate.id === trip)?.name ?? trip
  return SOURCES.includes(source) ? sourceLabelOf(sourceLabels, source) : key
}
