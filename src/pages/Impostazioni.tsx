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
import { ThemeChooser } from '../components/Controls'
import { IncomeEditor } from '../components/IncomeEditor'
import { Card, Notice, Segmented, StatTile, VEIL, useToast } from '../components/ui'
import { clearToken, loadToken, saveToken, testAccess } from '../data/github'
import { formatDate } from '../domain/dates'
import { incomeBreakdown } from '../domain/income'
import { formatEuro } from '../domain/money'
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
  } = usePageData()
  const toast = useToast()
  const person = view.person
  const profile = person === 'me' ? config.income.me : config.income.partner
  const [token, setToken] = useState(loadToken() ?? '')
  const [editingIncome, setEditingIncome] = useState(false)
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<string | null>(null)

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
                <span>Viaggi</span>
                <span className="num">{dataset.trips.length}</span>
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

        <Card
          title="Scrittura nel repo"
          note="Serve per salvare tag 730, note e link agli scontrini"
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
                  Token GitHub (fine-grained, permesso «Contents: read and write» su questo repo)
                </label>
                <input
                  id="gh-token"
                  className="input"
                  type="password"
                  autoComplete="off"
                  placeholder="github_pat_…"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                />
                <p className="hint">
                  Resta in questo browser, non entra mai nel repo. Va rigenerato quando scade
                  (l'errore di salvataggio te lo dirà).
                </p>
              </div>

              <div className="row" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={token.trim() === ''}
                  onClick={() => {
                    saveToken(token)
                    toast.show('Token salvato su questo dispositivo.')
                    void syncNow()
                  }}
                >
                  Salva token
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={token.trim() === '' || checking}
                  onClick={() => {
                    if (!config.github) return
                    setChecking(true)
                    setCheckResult(null)
                    void testAccess(config.github, token.trim()).then((result) => {
                      setChecking(false)
                      setCheckResult(`${result.ok ? '✓' : '×'} ${result.message}`)
                    })
                  }}
                >
                  {checking ? 'Verifico…' : 'Verifica accesso'}
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
          title="Categorie"
          note="Le tinte sono otto e sono già tutte assegnate: dare un colore a una categoria vuol dire toglierlo a un'altra, e chi lo cede finisce in «Altre voci»"
        >
          <CategoryEditor lookup={lookup} />
        </Card>
      </div>
    </>
  )
}
