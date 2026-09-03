/** Pezzi elementari dell'interfaccia: schede, numeri, etichette, avvisi. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react'

import { formatPct, sanitizeAmount } from '../domain/money'
import type { MarginStatus } from '../domain/income'

/**
 * Il segno al posto di un numero coperto. Sta qui, e non in due posti, perché i
 * luoghi che oscurano i guadagni sono due — la scheda del margine e il profilo
 * entrate — e devono coprire allo stesso modo. → ADR-0016
 */
export const VEIL = '••••'

// ─────────────────────── blocco dello scorrimento ───────────────────────

/**
 * Quanti fogli sono aperti adesso. Un booleano non basterebbe: un foglio può
 * sostituirne un altro (dal dettaglio di una spesa si passa a correggerla), e
 * React smonta il vecchio **dopo** aver montato il nuovo o prima, a seconda del
 * caso — con un booleano lo sblocco dell'uno cancellerebbe il blocco dell'altro.
 */
let openSheets = 0

/**
 * Con un foglio aperto la pagina dietro non si scorre: si scorre solo il foglio.
 *
 * Costa una classe su `<html>` e niente altro, perché da ADR-0048 quello che
 * scorre è `.content` e non il documento: togliere lo scorrimento a un elemento
 * **conserva la sua posizione**, quindi non serve il trucco del `body` fisso con
 * il ripristino dello `scrollY` — che è il modo in cui di solito si finisce a
 * perdere il segno riaprendo l'elenco. È ciò che serve al supermercato, dove si
 * alterna «quanto costava?» e «lo registro».
 */
export function useScrollLock(): void {
  useEffect(() => {
    openSheets += 1
    document.documentElement.classList.add('is-locked')
    return () => {
      openSheets -= 1
      if (openSheets === 0) document.documentElement.classList.remove('is-locked')
    }
  }, [])
}

/**
 * Chiude con Esc finché il componente è montato.
 *
 * Era lo stesso effetto di cinque righe copiato in ogni foglio — e al sesto
 * (la tessera a tutto schermo) è diventato un gancio. Chi lo chiama passa una
 * funzione **stabile** (`useCallback`) o il listener si riattacca a ogni
 * disegno: non è un guasto, è lavoro inutile.
 */
export function useEscape(onClose: () => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
}

/**
 * Tiene lo schermo acceso finché il componente è montato.
 *
 * **È il sostituto della luminosità**, ed è bene sapere perché non c'è di
 * meglio: nessun browser espone un modo di alzare la luminosità dello schermo.
 * La proposta esiste dal 2020 (`Screen.requestBrightnessIncrease()`), la prova
 * di concetto in Chromium è stata abbandonata nel 2022, e nemmeno un'app
 * aggiunta alla schermata Home su iOS può farlo. Non è una cosa che «un giorno
 * si farà»: nessuno la sta facendo. Quello che si può fare, e che i lettori
 * ottici apprezzano quasi quanto, è **una faccia bianca** e **uno schermo che
 * non si spegne** mentre la tessera è aperta. → ADR-0084
 *
 * Tre cose che il codice deve sapere:
 * - **Il permesso si perde andando in secondo piano.** Il blocco è legato a una
 *   pagina visibile: passare a un'altra app lo rilascia, e tornare qui non lo
 *   ripristina da sé. Quindi si richiede a ogni `visibilitychange`, che è
 *   esattamente il gesto della cassa — apri la tessera, guardi il telefono
 *   della persona davanti, torni.
 * - **Può non esserci.** Safari lo ha dal 16.4 nel browser, ma nell'app
 *   aggiunta alla Home **solo dal 18.4**: prima, la richiesta falliva in
 *   silenzio. Quindi è facoltativo per costruzione e non si dice niente a
 *   nessuno: uno schermo che si spegne dopo trenta secondi è il comportamento
 *   normale di un telefono, non un guasto da annunciare.
 * - **Il rilascio può fallire** su un blocco già perso, e quel `catch` vuoto è
 *   voluto: non c'è niente da fare e niente da dire.
 */
export function useWakeLock(): void {
  useEffect(() => {
    /* `in` invece di un cast: su iOS 17 l'oggetto non c'è, e leggerlo con un
       tipo che lo promette porterebbe a chiamare un metodo inesistente. */
    if (!('wakeLock' in navigator)) return

    let sentinel: WakeLockSentinel | undefined
    let dismissed = false

    const acquire = async (): Promise<void> => {
      if (dismissed || document.visibilityState !== 'visible') return
      if (sentinel !== undefined && !sentinel.released) return
      try {
        sentinel = await navigator.wakeLock.request('screen')
        /* Smontato mentre la richiesta era in volo: si rilascia subito, o lo
           schermo resterebbe acceso dopo aver chiuso la tessera. */
        if (dismissed) void sentinel.release().catch(() => undefined)
      } catch {
        /* Non concesso (batteria scarica, versione vecchia, permesso negato):
           la tessera funziona comunque. */
      }
    }

    const onVisible = (): void => {
      void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      dismissed = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release().catch(() => undefined)
    }
  }, [])
}

// ─────────────────────────── scheda ───────────────────────────

export function Card({
  title,
  note,
  action,
  children,
  /* Classi di **comportamento**, non di stile: `scroll-target` dice che qualcuno
     ci arriva scorrendo, non come è dipinta la scheda. I colori restano nei
     token, come sempre. */
  className,
  ref,
}: {
  title?: string
  note?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  ref?: Ref<HTMLElement>
}): ReactNode {
  return (
    <section className={className ? `card ${className}` : 'card'} ref={ref}>
      {title || action || note ? (
        <div className="card-head">
          <div>
            {title ? <h2 className="card-title">{title}</h2> : null}
            {note ? <p className="card-note">{note}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  )
}

// ─────────────────────────── numeri ───────────────────────────

export function StatTile({
  label,
  value,
  hint,
  delta,
  aside,
  /** Per i valori che non sono importi (una data, un testo): stanno su una riga. */
  smallValue = false,
}: {
  label: string
  value: string
  hint?: string
  delta?: ReactNode
  aside?: ReactNode
  smallValue?: boolean
}): ReactNode {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div className={`stat-value${smallValue ? ' is-small' : ''}`}>{value}</div>
          {hint ? <div className="stat-hint">{hint}</div> : null}
          {delta}
        </div>
        {aside}
      </div>
    </div>
  )
}

/**
 * Variazione con segno, freccia e parola: per una spesa «più» è una cattiva
 * notizia, quindi il verso buono è di default verso il basso.
 */
export function DeltaLabel({
  change,
  goodWhen = 'down',
  suffix,
}: {
  change: number | null
  goodWhen?: 'down' | 'up'
  suffix?: string
}): ReactNode {
  if (change === null) return <span className="delta is-neutral">— nessun confronto</span>
  const rounded = Math.abs(change) < 0.005 ? 0 : change
  if (rounded === 0) {
    return <span className="delta is-neutral">= in linea{suffix ? ` ${suffix}` : ''}</span>
  }
  const up = rounded > 0
  const good = goodWhen === 'down' ? !up : up
  return (
    <span className={`delta ${good ? 'is-good' : 'is-bad'}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      {up ? '+' : '−'}
      {formatPct(Math.abs(rounded))}
      {suffix ? ` ${suffix}` : ''}
    </span>
  )
}

/**
 * Il piede di un elenco con un tetto: «Mostra altre 12 (di 46 rimaste)».
 *
 * Sta qui e non in ogni pagina perché è la stessa cosa ovunque — un elenco
 * troncato che si allunga di una pagina — e perché una pagina che stampa
 * quattromila pixel di righe non si scorre col pollice.
 */
export function ShowMore({
  rest,
  step,
  onMore,
  /* «altre … rimaste» per le spese, «altri … rimasti» per i movimenti: in
     italiano il genere cambia due parole, quindi lo dice chi chiama. */
  gender = 'f',
}: {
  rest: number
  step: number
  onMore: () => void
  gender?: 'f' | 'm'
}): ReactNode {
  if (rest <= 0) return null
  const altri = gender === 'f' ? 'altre' : 'altri'
  const rimasti = gender === 'f' ? 'rimaste' : 'rimasti'
  return (
    <div className="card-foot" style={{ textAlign: 'center' }}>
      <button type="button" className="btn btn-sm" onClick={onMore}>
        Mostra {altri} {Math.min(step, rest)} (di {rest} {rimasti})
      </button>
    </div>
  )
}

// ─────────────────────────── etichette ───────────────────────────

export function Chip({
  children,
  tone,
  dotColor,
}: {
  children: ReactNode
  tone?: 'ok' | 'attenzione' | 'oltre' | 'tax'
  dotColor?: string
}): ReactNode {
  return (
    <span className={`chip${tone ? ` is-${tone}` : ''}`}>
      {dotColor ? <span className="chip-dot" style={{ background: dotColor }} aria-hidden="true" /> : null}
      {children}
    </span>
  )
}

const STATUS_TEXT: Record<MarginStatus, { glyph: string; label: string; tone?: 'ok' | 'attenzione' | 'oltre' }> = {
  ok: { glyph: '✓', label: 'Sotto controllo', tone: 'ok' },
  attenzione: { glyph: '!', label: 'Da tenere d’occhio', tone: 'attenzione' },
  oltre: { glyph: '×', label: 'Oltre le entrate', tone: 'oltre' },
  sconosciuto: { glyph: '?', label: 'Entrate non impostate' },
}

/** Il colore non porta mai il significato da solo: c'è sempre glifo + parola. */
export function StatusChip({ status }: { status: MarginStatus }): ReactNode {
  const { glyph, label, tone } = STATUS_TEXT[status]
  return (
    <Chip tone={tone}>
      <span aria-hidden="true">{glyph}</span>
      {label}
    </Chip>
  )
}

// ─────────────────────────── avvisi e vuoti ───────────────────────────

export function Notice({
  tone = 'info',
  icon,
  children,
}: {
  tone?: 'info' | 'warn' | 'bad'
  icon?: string
  children: ReactNode
}): ReactNode {
  const cls = tone === 'info' ? 'notice' : `notice is-${tone}`
  return (
    <div className={cls}>
      <span className="notice-icon" aria-hidden="true">
        {icon ?? (tone === 'bad' ? '×' : tone === 'warn' ? '!' : 'i')}
      </span>
      <div>{children}</div>
    </div>
  )
}

// ─────────────────────────── controlli ───────────────────────────

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  title?: string
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
}): ReactNode {
  /* Da quattro voci in su l'imbottitura piena sborda dai 390px del telefono. */
  const tight = options.length >= 4

  return (
    <div className={`segmented${tight ? ' is-tight' : ''}`} role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="segmented-option"
          aria-pressed={option.value === value}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Campo importo: tastierino numerico sul telefono, e dentro entrano solo numeri.
 *
 * `inputMode="decimal"` è ciò che apre il tastierino su iOS; `type` resta testo
 * perché il tipo numerico porta le frecette e litiga con la virgola. Il filtro
 * sta in `sanitizeAmount`, testato: qui non si scrive una lettera nemmeno
 * incollandola.
 */
export function AmountInput({
  id,
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
}): ReactNode {
  return (
    <input
      id={id}
      className="input"
      type="text"
      inputMode="decimal"
      autoComplete="off"
      /* Su Android indirizza la tastiera anche dove `inputMode` non basta. */
      pattern="[0-9]*[,.]?[0-9]*"
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(event) => onChange(sanitizeAmount(event.target.value))}
    />
  )
}

/**
 * Un campo di testo con le grafie già usate sotto, tappabili.
 *
 * Stava dentro `PriceForm` e serve identico alla lista della spesa: riusare un
 * suggerimento non è una comodità, è ciò che tiene unita una serie — i prezzi di
 * un prodotto si raggruppano per nome, e nella lista «Latte» scritto in tre modi
 * fa tre voci che nessuno riconosce come la stessa cosa.
 *
 * Le opzioni **arrivano già scelte** da chi chiama, e non le calcola questo
 * componente: chi chiama sa da dove vengono (le rilevazioni, le voci della
 * lista, i nomi delle carte) e questo resta un campo, senza sapere niente del
 * dominio.
 */
export function NameWithSuggestions({
  id,
  label,
  placeholder,
  value,
  options,
  onChange,
  onEnter,
  inputRef,
  children,
}: {
  id: string
  label: string
  placeholder: string
  value: string
  /** Le grafie da proporre, già filtrate. */
  options: readonly string[]
  onChange: (value: string) => void
  /** Invio nel campo: nella lista della spesa aggiunge, che è il gesto del giro. */
  onEnter?: () => void
  inputRef?: Ref<HTMLInputElement>
  /** Un suggerimento sotto il campo, quando chi chiama ne ha uno da dare. */
  children?: ReactNode
}): ReactNode {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        ref={inputRef}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={
          onEnter
            ? (event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onEnter()
                }
              }
            : undefined
        }
      />
      {options.length > 0 ? (
        <div className="suggest">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className="suggest-chip"
              onClick={() => onChange(option)}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
      {children}
    </div>
  )
}

/**
 * Icona e nome, i due campi con cui si battezza qualcosa: una categoria che
 * nasce, una che si rinomina, un viaggio. Scritti tre volte, il giorno che uno
 * cresce gli altri restano indietro.
 */
export function NameFields({
  emoji,
  label,
  onEmoji,
  onLabel,
  what,
  emojiHint,
  labelHint,
}: {
  emoji: string
  label: string
  onEmoji: (value: string) => void
  onLabel: (value: string) => void
  /** Finisce nelle etichette per chi legge con la voce: «Icona della categoria». */
  what: string
  emojiHint: string
  labelHint: string
}): ReactNode {
  return (
    <div className="row row-inline" style={{ gap: 6 }}>
      <input
        className="input"
        style={{ width: 70, flex: '0 0 auto' }}
        value={emoji}
        maxLength={4}
        aria-label={`Icona ${what}`}
        placeholder={emojiHint}
        onChange={(event) => onEmoji(event.target.value)}
      />
      <input
        className="input"
        value={label}
        aria-label={`Nome ${what}`}
        placeholder={labelHint}
        onChange={(event) => onLabel(event.target.value)}
      />
    </div>
  )
}

// ─────────────────────────── toast ───────────────────────────

interface ToastApi {
  show: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }): ReactNode {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const show = useCallback((next: string) => {
    setMessage(next)
    if (timer.current !== undefined) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMessage(null), 2600)
  }, [])

  useEffect(
    () => () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current)
    },
    [],
  )

  const api = useMemo<ToastApi>(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      {message ? (
        <div className="toast" role="status" aria-live="polite">
          {message}
        </div>
      ) : null}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  return ctx ?? { show: () => undefined }
}
