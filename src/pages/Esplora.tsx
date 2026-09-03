/**
 * Esplora: la porta delle viste che non stanno nella barra — e non è un menù.
 *
 * Un menù ti porta da qualche parte senza dirti niente finché non ci sei
 * arrivato. Qui ogni scheda porta **il suo numero già in vista**: se il saldo è
 * a posto lo vedi da qui, e il secondo tocco non serve più. È il patto che
 * giustifica di aver spostato Casa, Gatto e Vacanze da un tocco a due.
 * → ADR-0044
 *
 * Le anteprime escono **solo da selettori che esistono già**, e per la persona
 * scelta sul dispositivo come le pagine che aprono: un'anteprima che dicesse un
 * numero diverso da quello della sua pagina sarebbe peggio di nessuna anteprima.
 * Se un giorno un'anteprima nuova pretendesse un selettore nuovo nel dominio, si
 * semplifica l'anteprima — non è questa la pagina che allarga il dominio.
 */

import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { Sparkline } from '../components/charts/Sparkline'
import { Card } from '../components/ui'
import { formatDate, monthLabelShort } from '../domain/dates'
import { formatEuro, toCents } from '../domain/money'
import {
  expensesOfMonth,
  fillMonthGaps,
  houseLedger,
  houseOutside,
  tax730ByYear,
  totalShare,
} from '../domain/selectors'
import { toBuy } from '../domain/shopping'
import { tripTitleOf, tripsOf } from '../domain/types'
import { useReadyStore } from '../data/store'
import { useCoupleBalance, usePageData, useProjects } from './usePageData'

interface HubEntry {
  to: string
  glyph: string
  name: string
  /** Il numero, la data, la parola: quello che si legge senza entrare. */
  value: string
  /** Di cosa è quel numero. Sempre presente: un numero senza unità non informa. */
  hint: string
  /** Al posto del numero, quando l'anteprima è un grafico. */
  aside?: ReactNode
}

function HubGroup({ title, entries }: { title: string; entries: HubEntry[] }): ReactNode {
  return (
    <Card title={title}>
      <div className="hub-grid">
        {entries.map((entry) => (
          /* La riga intera è il bersaglio, non il nome: si tocca con il pollice. */
          <Link className="hub-card" to={entry.to} key={entry.to}>
            <span className="hub-glyph" aria-hidden="true">
              {entry.glyph}
            </span>
            <span className="hub-text">
              <span className="hub-name">{entry.name}</span>
              <span className="hub-hint">{entry.hint}</span>
            </span>
            {entry.aside ?? <span className="hub-value">{entry.value}</span>}
            <span className="hub-chevron" aria-hidden="true">
              ›
            </span>
          </Link>
        ))}
      </div>
    </Card>
  )
}

export function Esplora(): ReactNode {
  const { config, dataset, view, lookup, month, series, all, everyday } = usePageData()
  /* Carte e lista non passano da `usePageData`: non sono spese e non sono di
     nessuno dei due. → ADR-0088, ADR-0082 */
  const { cards, shopping } = useReadyStore()
  const person = view.person
  const other = person === 'me' ? 'partner' : 'me'
  const { houseTricount, houseCategory, catCategory } = config

  // ── Saldo: il segno del calcolo è fisso, lo gira chi guarda. → ADR-0019 ──
  const balance = useCoupleBalance()
  const owedToMe = person === 'me' ? balance.balance : -balance.balance
  const owedCents = toCents(owedToMe)

  // ── Statistiche: la stessa serie di dodici mesi del Riepilogo ──
  /* Riempita una volta e derivata due: sono la stessa serie, e `fillMonthGaps`
     non è gratis su diciotto mesi. */
  const sparkValues = useMemo(
    () => fillMonthGaps(series).slice(-12).map((row) => row.total),
    [series],
  )
  /* I **mesi osservati**, come li conta la pagina Statistiche, non quelli
     riempiti: sono due grandezze diverse per invariante (→ ADR-0034), e finché
     l'anteprima dice la stessa cosa della pagina che apre, deve contarli come
     lei. Oggi le due coincidono, perché questo numero si vede solo quando la
     sparkline non si può disegnare, cioè sotto i due mesi — ma è una coincidenza
     su cui non vale la pena appoggiarsi. */
  const monthsOfHistory = series.length

  /*
   * Casa: i due insiemi sommati, che qui si può fare perché `houseOutside`
   * esclude per costruzione il tricount di casa — quindi non c'è intersezione da
   * contare due volte. È l'unico posto dove il numero è uno: la pagina li tiene
   * separati, perché là si guarda **cosa** è casa e non quanto. → ADR-0017
   */
  const houseMonth = useMemo(() => {
    /* `everyday`, come la pagina che apre: un'anteprima che comprendesse il
       progetto direbbe un numero che là dentro non si ritrova. → ADR-0074 */
    const ledger = houseLedger(everyday, houseTricount)
    const outside = houseOutside(everyday, houseTricount, houseCategory)
    return (
      totalShare(expensesOfMonth(ledger, month), person) +
      totalShare(expensesOfMonth(outside, month), person)
    )
  }, [everyday, houseCategory, houseTricount, month, person])

  /* Un filtro e una somma, non `catStats`: quello costruisce serie mensile e
     ripartizione per sottocategoria — tutta roba della pagina del gatto — e qui
     servono due numeri. */
  const cat = useMemo(() => {
    const scope = everyday.filter((expense) => expense.category === catCategory)
    return { count: scope.length, month: totalShare(expensesOfMonth(scope, month), person) }
  }, [catCategory, everyday, month, person])

  /* Il viaggio più recente: `tripStats` ordina per data di inizio, ma qui basta
     l'elenco dei viaggi — un viaggio senza spese è un viaggio. → ADR-0036 */
  const lastTrip = useMemo(() => {
    const trips = tripsOf(dataset.tricounts)
    return [...trips].sort((a, b) => (a.start < b.start ? 1 : -1))[0]
  }, [dataset.tricounts])

  const taxYear = useMemo(() => {
    const years = tax730ByYear(dataset.expenses, person)
    return years[0]
  }, [dataset.expenses, person])

  /* Dallo stesso posto da cui lo prende la pagina che apre: è ciò che rende
     l'anteprima una promessa mantenuta invece di un secondo calcolo. → ADR-0044 */
  const progetti = useProjects()

  const monthName = monthLabelShort(month)

  const raccolte: HubEntry[] = [
    {
      to: '/casa',
      glyph: '🏠',
      /* Il nome dai dati, come nella pagina che apre: accanto a un progetto che
         si chiama anch'esso «Casa …», «Casa» da sola non distingue. → ADR-0074 */
      name: lookup.tricountLabel(houseTricount),
      value: formatEuro(houseMonth, { decimals: 0 }),
      hint: `la tua quota a ${monthName}`,
    },
    {
      to: '/gatto',
      glyph: '🐈',
      name: 'Il gatto',
      value: cat.count === 0 ? '—' : formatEuro(cat.month, { decimals: 0 }),
      hint: cat.count === 0 ? 'ancora nessuna spesa' : `la tua quota a ${monthName}`,
    },
    {
      to: '/vacanze',
      glyph: '🌍',
      name: 'Vacanze',
      value: lastTrip ? String(lastTrip.year) : '—',
      hint: lastTrip
        ? `l'ultima: ${tripTitleOf(lastTrip)}, ${formatDate(lastTrip.start)}`
        : 'nessun viaggio registrato',
    },
    ...progetti.map((stats) => ({
      to: `/progetto/${stats.tricount.id}`,
      glyph: stats.tricount.emoji ?? '🏗️',
      name: stats.tricount.name,
      value: stats.all.count === 0 ? '—' : formatEuro(stats.all.total, { decimals: 0 }),
      /* Il totale è **tutto** il progetto, capitale compreso: è la domanda
         «quanto ci è costata questa casa», e la scheda che apre mostra lo
         stesso numero. Lo spacchetta la pagina, non l'anteprima. → ADR-0079 */
      hint: stats.all.count === 0 ? 'nessuna spesa ancora' : 'speso finora, capitale compreso',
    })),
  ]

  const analisi: HubEntry[] = [
    {
      to: '/statistiche',
      glyph: '📊',
      name: 'Statistiche',
      /* Il ripiego di quando la sparkline non si può disegnare: `Sparkline` non
         rende niente sotto i due punti, e un posto vuoto sembrerebbe un guasto. */
      value: `${monthsOfHistory} mesi`,
      hint: 'andamento, composizione, storia',
      /* Un grafico dice «andamento» meglio di qualunque numero, e questa è la
         pagina dell'andamento. */
      aside:
        sparkValues.length >= 2 ? (
          <span className="hub-value">
            <Sparkline values={sparkValues} />
          </span>
        ) : undefined,
    },
    {
      to: '/730',
      glyph: '🧾',
      name: 'Spese da 730',
      value: taxYear ? String(taxYear.items.length) : '0',
      hint: taxYear
        ? `${taxYear.items.length === 1 ? 'voce marcata' : 'voci marcate'} nel ${taxYear.year}`
        : 'nessuna voce marcata',
    },
    {
      to: '/saldo',
      glyph: '⚖️',
      name: 'Saldo',
      value: owedCents === 0 ? 'in pari' : formatEuro(Math.abs(owedToMe), { decimals: 0 }),
      hint:
        owedCents === 0
          ? `con ${config.people[other].name}`
          : owedCents > 0
            ? `${config.people[other].name} deve a te`
            : `devi a ${config.people[other].name}`,
    },
  ]

  /*
   * Le carte, con il loro numero già in vista come chiedono le altre schede:
   * esce da `cards.length`, quindi non pretende nessun selettore nuovo — che è
   * la condizione posta da ADR-0044 per le anteprime dell'hub.
   */
  /* Da prendere, non il totale: è la domanda che si fa aprendo la lista, e
     `toBuy` è lo stesso selettore che usa la pagina — un'anteprima che dicesse
     un numero diverso da quello della sua pagina toglierebbe la ragione per cui
     l'hub esiste. → ADR-0044 */
  const daPrendere = toBuy(shopping).length

  const negozio: HubEntry[] = [
    {
      to: '/lista',
      glyph: '🛒',
      name: 'Lista della spesa',
      value: daPrendere === 0 ? '—' : String(daPrendere),
      hint: daPrendere === 0 ? 'niente da comprare' : daPrendere === 1 ? 'cosa da prendere' : 'cose da prendere',
    },
    {
      to: '/carte',
      glyph: '💳',
      name: 'Carte',
      value: String(cards.length),
      hint: cards.length === 1 ? 'carta fedeltà' : 'carte fedeltà',
    },
  ]

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1>🧭 Esplora</h1>
          <p className="page-sub">
            Le viste che non stanno nella barra · {all.length} spese in archivio
          </p>
        </div>
      </div>

      <div className="stack">
        <HubGroup title="Raccolte" entries={raccolte} />
        <HubGroup title="Analisi" entries={analisi} />
        <HubGroup title="In negozio" entries={negozio} />
      </div>
    </>
  )
}
