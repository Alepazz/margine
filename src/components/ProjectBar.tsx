/**
 * La barra dei rimborsi di un progetto: «a che punto sei con la casa».
 *
 * Vive in un componente solo perché la disegnano **due** pagine — il Riepilogo e
 * quella del progetto — e devono dire lo stesso numero con le stesse parole: è
 * la ragione per cui il saldo di ogni giorno si costruisce in un posto solo
 * (`useCoupleBalance`), applicata a una cosa che si guarda con la stessa
 * frequenza. → ADR-0080, ADR-0044
 *
 * Il fondo della barra è il debito **lordo**, non quello che resta: è ciò che le
 * dà il comportamento che Alessio ha chiesto — «più io anticipo più si allunga,
 * più lei salda più si accorcia». Col residuo al denominatore la parte piena
 * starebbe al 100 % per sempre.
 */

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { formatEuro } from '../domain/money'
import { projectProgress, type ProjectStats } from '../domain/selectors'
import { aTo } from '../domain/text'
import { titleOf, type Person, type PersonId } from '../domain/types'

export function ProjectBar({
  stats,
  person,
  people,
  to,
}: {
  stats: ProjectStats
  person: PersonId
  people: Record<PersonId, Person>
  /** Se presente, il titolo diventa un collegamento alla pagina del progetto. */
  to?: string
}): ReactNode {
  const progress = projectProgress(stats)
  /* Nessun capitale anticipato: non c'è niente da rimborsare, e una barra a zero
     su zero direbbe «sei indietro» di un debito che non esiste. */
  if (progress === null) return null

  const titolo = titleOf(stats.tricount)
  const finito = progress.left === 0
  const ioDebbo = progress.debtor === person
  const altro = person === 'me' ? 'partner' : 'me'

  const frase = finito
    ? `Rimborsato tutto: ${formatEuro(progress.owed, { decimals: 0 })}.`
    : ioDebbo
      ? `Hai rimborsato ${formatEuro(progress.repaid, { decimals: 0 })} dei ${formatEuro(
          progress.owed,
          { decimals: 0 },
        )} che devi ${aTo(people[altro].name)} ${people[altro].name}.`
      : `${people[altro].name} ha rimborsato ${formatEuro(progress.repaid, {
          decimals: 0,
        })} dei ${formatEuro(progress.owed, { decimals: 0 })} che ti deve.`

  return (
    <div className="meter">
      <div className="project-bar-head">
        <span className="project-bar-title">
          {to ? <Link to={to}>{titolo}</Link> : titolo}
        </span>
        <span className="project-bar-left">
          {finito ? 'in pari' : `mancano ${formatEuro(progress.left, { decimals: 0 })}`}
        </span>
      </div>
      <div
        className="meter-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        /* La scala è in percentuale e non in euro, come nella barra del mese:
           l'albero di accessibilità non è il posto dove pubblicare una cifra.
           → ADR-0066 */
        aria-valuenow={Math.round(progress.fraction * 100)}
        aria-label={`Rimborsi di ${titolo}`}
      >
        <div className="meter-fill" style={{ width: `${progress.fraction * 100}%` }} />
      </div>
      <p className="meter-note">{frase}</p>
    </div>
  )
}
