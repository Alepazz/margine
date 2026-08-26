/**
 * Impostazioni: profilo entrate, tema, accesso in scrittura al repo, dati,
 * categorie.
 *
 * Entrate e categorie si **modificano qui**: stanno nel file cifrato della
 * configurazione, che l'app sa riscrivere come riscrive le spese. Prima erano in
 * sola lettura e cambiarle voleva dire aprire il computer di casa. → ADR-0024
 */

import { useState, type ReactNode } from 'react'

import { CategoryEditor } from '../components/CategoryEditor'
import { DeviceIdentity, ThemeChooser } from '../components/Controls'
import { IncomeEditor } from '../components/IncomeEditor'
import { TricountForm } from '../components/TricountForm'
import { Card, Notice, Segmented, StatTile, VEIL, useToast } from '../components/ui'
import { clearToken, loadToken, saveToken, testAccess } from '../data/github'
import { CHANGE_GROUPS, GROUP_LABELS } from '../domain/changes'
import { formatDate } from '../domain/dates'
import { incomeBreakdown } from '../domain/income'
import { formatEuro } from '../domain/money'
import { tricountTitleOf } from '../domain/types'
import { usePageData } from './usePageData'

export function Impostazioni(): ReactNode {
  const {
    config,
    dataset,
    view,
    lookup,
    sync,
    syncNow,
    lock,
    reload,
    hasStoredPassphrase,
    hideIncome,
    hideIncomeByDefault,
    toggleHideIncome,
    setHideIncomeByDefault,
    news,
    setNewsGroups,
    addTricount,
  } = usePageData()
  const toast = useToast()
  const person = view.person
  const profile = person === 'me' ? config.income.me : config.income.partner
  const [token, setToken] = useState(loadToken() ?? '')
  const [editingIncome, setEditingIncome] = useState(false)
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<string | null>(null)
  const [creatingTricount, setCreatingTricount] = useState(false)

  const breakdown = profile ? incomeBreakdown(profile) : null
  /* Qui i numeri sono i guadagni nella loro forma più nuda: si coprono tutti. */
  const money = (value: number): string =>
    hideIncome ? VEIL : formatEuro(value, { decimals: 0 })

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1>Impostazioni</h1>
          <p className="page-sub">Entrate, aspetto, scrittura nel repo, stato dei dati</p>
        </div>
      </div>

      <div className="stack">
        {/*
          L'identità si dice una volta, alla prima apertura, e qui si legge: non
          c'è un controllo per cambiarla, perché cambiarla vorrebbe dire aprire
          il compartimento personale dell'altra persona. → ADR-0042, ADR-0038
        */}
        <Card title="Questo dispositivo" note="Di chi è: decide quali tricount e quali numeri si vedono">
          <DeviceIdentity />
          <div className="card-foot">
            Non è una serratura: la passphrase è una sola e apre tutto il file, quindi con gli
            strumenti del browser si legge comunque tutto. Toglie il gesto, non la possibilità.
            → ADR-0042, ADR-0039
          </div>
        </Card>

        <Card
          title={`Profilo entrate — ${config.people[person].name}`}
          note="Serve a trasformare le spese in margine"
          action={
            editingIncome ? null : (
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className="btn btn-sm" onClick={() => setEditingIncome(true)}>
                  {profile?.configured ? 'Modifica' : 'Imposta'}
                </button>
                {profile?.configured ? (
                  <button type="button" className="btn btn-sm" onClick={toggleHideIncome}>
                    {hideIncome ? 'Mostra' : 'Nascondi'}
                  </button>
                ) : null}
              </div>
            )
          }
        >
          {editingIncome ? (
            <IncomeEditor
              person={person}
              profile={profile}
              onDone={() => setEditingIncome(false)}
            />
          ) : !profile || !profile.configured ? (
            <Notice tone="warn">
              Non è ancora impostato. Bastano lo stipendio netto e l'obiettivo di risparmio: tocca
              «Imposta». Finché manca, l'app mostra le spese ma non il margine.
            </Notice>
          ) : (
            <>
              <div className="kpi-row">
                <StatTile label="Stipendio netto" value={money(breakdown?.stipendio ?? 0)} />
                <StatTile
                  label="Buoni pasto"
                  value={money(breakdown?.buoniPasto ?? 0)}
                  hint={
                    hideIncome
                      ? undefined
                      : `${profile.mealVouchers.valuePerDay.toFixed(2)} € × ${profile.mealVouchers.daysPerMonth} giorni`
                  }
                />
                <StatTile
                  label="Mensilità e bonus"
                  value={money(breakdown?.differite ?? 0)}
                  hint="spalmati su dodici mesi"
                />
                <StatTile
                  label="Entrate mensili"
                  value={money(breakdown?.totale ?? 0)}
                  hint={
                    hideIncome
                      ? undefined
                      : profile.monthlySavingsTarget > 0
                        ? `obiettivo risparmio ${formatEuro(profile.monthlySavingsTarget, { decimals: 0 })}`
                        : 'nessun obiettivo di risparmio impostato'
                  }
                />
              </div>
              {profile.note ? <div className="card-foot">{profile.note}</div> : null}
              <div className="card-foot">
                Cambia lo stipendio? Tocca «Modifica»: si salva nella configurazione cifrata e vale
                su tutti i dispositivi.
              </div>
            </>
          )}
        </Card>

        <Card title="Novità" note="Cosa fa comparire il pallino sulla campanella">
          <div className="stack" style={{ gap: 4 }}>
            {CHANGE_GROUPS.map((group) => {
              const on = news.groups.includes(group)
              return (
                <label className="checkbox" key={group}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(event) =>
                      setNewsGroups(
                        event.target.checked
                          ? [...news.groups, group]
                          : news.groups.filter((g) => g !== group),
                      )
                    }
                  />
                  {GROUP_LABELS[group]}
                </label>
              )
            })}
          </div>
          <div className="card-foot">
            Spegnere un gruppo lo toglie <strong>sia</strong> dall'elenco <strong>sia</strong> dal
            conteggio: un pallino che promettesse righe non mostrate sarebbe peggio di nessun
            pallino. La campanella conta solo le modifiche fatte dall'altra persona
            dall'interfaccia dell'app — le tue le hai appena fatte, e che siano arrivate te lo dice
            «salvato» qui sopra.
          </div>
          <div className="card-foot">
            Vive in questo browser come la persona scelta e il token: è una preferenza tua, non un
            fatto dei tricount, quindi non finisce nei dati e non segue gli altri dispositivi.
          </div>
        </Card>

        <Card title="Privacy" note="Come parte l'app su questo dispositivo">
          <Segmented<'clear' | 'hidden'>
            ariaLabel="All'apertura mostra i guadagni"
            value={hideIncomeByDefault ? 'hidden' : 'clear'}
            onChange={(choice) => setHideIncomeByDefault(choice === 'hidden')}
            options={[
              { value: 'clear', label: 'In chiaro', title: 'I guadagni si vedono subito' },
              { value: 'hidden', label: 'Oscurati', title: 'I guadagni partono coperti' },
            ]}
          />
          <div className="card-foot">
            Copre entrate, margine, spendibile e obiettivo di risparmio — qui e nel Riepilogo. Le
            spese restano visibili: sono uscite, non guadagni. Per scoprire il numero un momento
            basta toccarlo, e quel tocco vale solo per questa sessione: quello che resta è la scelta
            qui sopra. Vive in questo browser come la persona scelta e il token, quindi non finisce
            nei dati e non segue gli altri dispositivi.
          </div>
          <div className="card-foot">
            Un limite dichiarato: la pastiglia «sotto controllo / da tenere d'occhio» resta
            visibile, e dice che le entrate stanno sopra la spesa prevista. Regala una soglia, non
            una cifra — è il prezzo di conservare lo stato del mese.
          </div>
        </Card>

        <div className="grid-2">
          <Card title="Aspetto">
            <ThemeChooser />
            <div className="card-foot">
              «Automatico» segue l'impostazione del telefono o del computer.
            </div>
          </Card>

          <Card title="Dati">
            <div className="stack" style={{ gap: 6, fontSize: '0.9rem' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>Spese</span>
                <span className="num">{dataset.expenses.length}</span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>Tricount</span>
                <span className="num">{dataset.tricounts.length}</span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>Categorie</span>
                <span className="num">{config.categories.length}</span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>Ultimo aggiornamento</span>
                <span className="num">{formatDate(dataset.updatedAt.slice(0, 10))}</span>
              </div>
            </div>
            <div className="row" style={{ marginTop: 12, gap: 6 }}>
              <button type="button" className="btn btn-sm" onClick={reload}>
                Ricarica dal file
              </button>
              <button type="button" className="btn btn-sm btn-danger" onClick={lock}>
                {hasStoredPassphrase ? 'Dimentica passphrase e blocca' : 'Blocca'}
              </button>
            </div>
          </Card>
        </div>

        {/*
          La nota diceva «tag 730, note e link agli scontrini»: era vera prima
          di ADR-0018, quando l'app scriveva solo le annotazioni. Da allora
          questo token è ciò che fa uscire dal telefono **tutto** — spese,
          rimborsi, tricount, prezzi — e chi cercava «dove metto il token per i
          prezzi» saltava la scheda credendola di un'altra cosa. → ADR-0018
        */}
        <Card
          title="Scrittura nel repo"
          note="Il token che fa arrivare all'altra persona quello che scrivi: spese, prezzi, rimborsi, annotazioni"
        >
          {!config.github ? (
            <Notice tone="warn">
              Il repo non è configurato in <code>data/config.json</code>: le annotazioni restano su
              questo dispositivo finché non lo si imposta.
            </Notice>
          ) : (
            <div className="stack" style={{ gap: 12 }}>
              <div className="stack" style={{ gap: 4, fontSize: '0.9rem' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span>Repository</span>
                  <span className="num">
                    {config.github.owner}/{config.github.repo}
                  </span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span>Branch</span>
                  <span className="num">{config.github.branch}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span>File</span>
                  <span className="num">{config.github.dataPath}</span>
                </div>
              </div>

              <div className="field">
                <label className="label" htmlFor="gh-token">
                  Token GitHub
                </label>
                <input
                  id="gh-token"
                  className="input"
                  type="password"
                  autoComplete="off"
                  placeholder="github_pat_… o ghp_…"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                />
                <p className="hint">
                  Se il repo è tuo: token <strong>fine-grained</strong> con «Contents: read and
                  write» su questo repo. Se vi accedi come <strong>collaboratore</strong>, il repo
                  non compare in quell'elenco — serve un token <strong>classic</strong> con la sola
                  spunta <code>public_repo</code>. Si creano su{' '}
                  <code>github.com/settings/tokens</code>, che sono le impostazioni del{' '}
                  <strong>tuo account</strong>: nelle impostazioni del repo non c'è niente da fare.
                  → ADR-0040
                </p>
                <p className="hint">
                  Resta in questo browser, non entra mai nel repo. Va rigenerato quando scade
                  (l'errore di salvataggio te lo dirà).
                </p>
              </div>

              <div className="row" style={{ gap: 6 }}>
                {/*
                  Salvare **verifica**, e non è uno zelo: prima il pulsante
                  diceva «Token salvato su questo dispositivo» in ogni caso, e
                  `syncNow()` non fa nessuna richiesta se la coda è vuota. Il
                  risultato è che si poteva incollare un token senza permessi,
                  leggere un messaggio di successo, e vedere il token su GitHub
                  segnato «never used»: nessuno l'aveva mai adoperato. È lo
                  stesso difetto del controllo in lettura, in un altro punto.
                  → ADR-0043
                */}
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={token.trim() === '' || checking}
                  onClick={() => {
                    const github = config.github
                    if (!github) return
                    saveToken(token)
                    setChecking(true)
                    setCheckResult(null)
                    void testAccess(github, token.trim()).then((result) => {
                      setChecking(false)
                      setCheckResult(`${result.ok ? '✓' : '×'} ${result.message}`)
                      toast.show(
                        result.ok
                          ? 'Token salvato: la scrittura funziona.'
                          : 'Token salvato, ma non può scrivere: leggi qui sotto.',
                      )
                      if (result.ok) void syncNow()
                    })
                  }}
                >
                  {checking ? 'Verifico…' : 'Salva e verifica'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    clearToken()
                    setToken('')
                    setCheckResult(null)
                    toast.show('Token rimosso da questo dispositivo.')
                  }}
                >
                  Rimuovi
                </button>
              </div>

              {checkResult ? <p className="hint">{checkResult}</p> : null}

              <div className="card-foot">
                Modifiche in attesa: <strong>{sync.pending}</strong>
                {sync.lastError ? ` · ultimo errore: ${sync.lastError}` : ''}
                {sync.pending > 0 ? (
                  <>
                    {' '}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => void syncNow()}>
                      Salva adesso
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          )}
        </Card>

        <Card
          title="I tricount"
          note="Chi partecipa a cosa. Le vacanze si aprono dalla pagina Vacanze"
          action={
            creatingTricount ? null : (
              <button type="button" className="btn btn-sm" onClick={() => setCreatingTricount(true)}>
                Nuovo tricount
              </button>
            )
          }
        >
          {creatingTricount ? (
            <div style={{ marginBottom: 12 }}>
              <TricountForm
                takenIds={new Set(dataset.tricounts.map((t) => t.id))}
                vacation={false}
                onCreate={(candidate) => {
                  addTricount(candidate)
                  setCreatingTricount(false)
                  toast.show(`Tricount «${candidate.name}» creato.`)
                }}
                onCancel={() => setCreatingTricount(false)}
                onProblem={(message) => toast.show(message)}
              />
            </div>
          ) : null}
          <div className="stack" style={{ gap: 6, fontSize: '0.9rem' }}>
            {dataset.tricounts.map((tricount) => (
              <div className="row" style={{ justifyContent: 'space-between', gap: 8 }} key={tricount.id}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tricountTitleOf(tricount)}
                  {tricount.trip ? ` · ${tricount.trip.year}` : ''}
                  {tricount.closed ? ' · concluso' : ''}
                </span>
                {/* Gli avatar dei membri: due emoji dicono «condiviso» a colpo d'occhio. */}
                <span style={{ whiteSpace: 'nowrap' }} aria-label={tricount.members.map((m) => config.people[m].name).join(' e ')}>
                  {tricount.members.map((member) => config.people[member].emoji).join(' ')}
                </span>
              </div>
            ))}
          </div>
          <div className="card-foot">
            Un tricount con un solo partecipante è personale: l'altra persona non lo trova nei suoi
            menù. Non è una cassaforte — la passphrase è una sola e apre tutto il file: è la
            disposizione delle stanze, non una serratura. → ADR-0039
          </div>
        </Card>

        <Card
          title="Categorie"
          note="Le tinte sono otto e sono già tutte assegnate: dare un colore a una categoria vuol dire toglierlo a un'altra, e chi lo cede finisce in «Altre voci»"
        >
          <CategoryEditor lookup={lookup} />
        </Card>
      </div>
    </>
  )
}
