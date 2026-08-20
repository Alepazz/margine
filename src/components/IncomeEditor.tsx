/**
 * Il profilo entrate, modificabile dall'app.
 *
 * Prima si cambiava solo nella sessione mensile, riscrivendo `data/config.json` a
 * mano e ricifrando: significava dipendere dal computer di casa per un numero
 * che cambia quando arriva la busta paga. Da quando l'app sa riscrivere anche
 * `config.json.enc` non serve più. → ADR-0024
 *
 * Restano fuori i buoni pasto: stanno a zero per una ragione — i pranzi che
 * pagano non sono nei tricount, quindi contarli gonfierebbe il margine contro
 * spese che non esistono. Metterli in un campo qui inviterebbe a romperlo. → ADR-0014
 */

import { useState, type ReactNode } from 'react'

import { useStore } from '../data/store'
import type { IncomeProfile, PersonId } from '../domain/types'
import { useToast } from './ui'

/** Accetta la virgola, come tutti i campi importo dell'app. */
function parseNumber(text: string): number {
  const normalised = text.trim().replace(',', '.')
  if (normalised === '') return Number.NaN
  return Number(normalised)
}

const EMPTY: IncomeProfile = {
  configured: false,
  netMonthly: 0,
  extraMonths: 0,
  annualBonusNet: 0,
  mealVouchers: { valuePerDay: 0, daysPerMonth: 0 },
  otherMonthlyNet: 0,
  monthlySavingsTarget: 0,
}

export function IncomeEditor({
  person,
  profile,
  onDone,
}: {
  person: PersonId
  profile: IncomeProfile | null
  onDone: () => void
}): ReactNode {
  const { setIncome } = useStore()
  const toast = useToast()
  const base = profile ?? EMPTY

  const [net, setNet] = useState(String(base.netMonthly))
  const [extra, setExtra] = useState(String(base.extraMonths))
  const [bonus, setBonus] = useState(String(base.annualBonusNet))
  const [other, setOther] = useState(String(base.otherMonthlyNet))
  const [savings, setSavings] = useState(String(base.monthlySavingsTarget))

  const fields: { id: string; label: string; hint?: string; value: string; set: (v: string) => void }[] = [
    { id: 'inc-net', label: 'Stipendio netto al mese', value: net, set: setNet },
    {
      id: 'inc-savings',
      label: 'Obiettivo di risparmio al mese',
      hint: 'Il margine «vero» è al netto di questo. Zero = nessun obiettivo.',
      value: savings,
      set: setSavings,
    },
    {
      id: 'inc-extra',
      label: 'Mensilità aggiuntive',
      hint: '13ª = 1, 13ª e 14ª = 2. Si spalmano su dodici mesi.',
      value: extra,
      set: setExtra,
    },
    { id: 'inc-bonus', label: 'Bonus annuo netto', value: bonus, set: setBonus },
    { id: 'inc-other', label: 'Altre entrate mensili nette', value: other, set: setOther },
  ]

  const save = (): void => {
    const values = [net, extra, bonus, other, savings].map(parseNumber)
    if (values.some((value) => !Number.isFinite(value) || value < 0)) {
      toast.show('Ogni numero deve essere zero o positivo.')
      return
    }
    const [netMonthly, extraMonths, annualBonusNet, otherMonthlyNet, monthlySavingsTarget] =
      values as [number, number, number, number, number]

    const next: IncomeProfile = {
      ...base,
      /* Compilato è compilato: da qui in poi il margine è un numero vero e
         l'app smette di dire «entrate non impostate». */
      configured: true,
      netMonthly,
      extraMonths,
      annualBonusNet,
      otherMonthlyNet,
      monthlySavingsTarget,
    }
    /* La nota diceva «STIMATO da…»: dopo una modifica a mano non è più vero, e
       una nota che mente è peggio di nessuna nota. */
    if (base.note && Math.round(netMonthly * 100) !== Math.round(base.netMonthly * 100)) {
      delete next.note
    }
    setIncome(person, next)
    toast.show('Profilo entrate aggiornato.')
    onDone()
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      {fields.map((field) => (
        <div className="field" key={field.id}>
          <label className="label" htmlFor={field.id}>
            {field.label}
          </label>
          <input
            id={field.id}
            className="input"
            inputMode="decimal"
            value={field.value}
            onChange={(event) => field.set(event.target.value)}
          />
          {field.hint ? <p className="hint">{field.hint}</p> : null}
        </div>
      ))}
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={save}>
          Salva
        </button>
        <button type="button" className="btn btn-sm" onClick={onDone}>
          Annulla
        </button>
      </div>
    </div>
  )
}
