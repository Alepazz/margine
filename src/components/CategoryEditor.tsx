/**
 * Creare, rinominare e cancellare una categoria dall'app.
 *
 * Cancellare una categoria che ha spese dentro **non si fa in silenzio**: quelle
 * spese devono andare da qualche parte, e la sola persona che sa dove è chi sta
 * cancellando. Quindi il pannello dice quante sono e chiede la destinazione, e
 * fino a quel momento non tocca niente.
 *
 * Le due operazioni partono insieme e finiscono in **un commit solo**: la
 * configurazione senza quella categoria, e le spese già spostate. Separarle
 * lascerebbe una finestra in cui i dati puntano a una categoria che non esiste
 * più. → ADR-0024, ADR-0025
 */

import { useMemo, useState, type ReactNode } from 'react'

import { useStore } from '../data/store'
import {
  SLOT_COUNT,
  categoriesWithout,
  withSlot,
  type CategoryLookup,
} from '../domain/categories'
import { newCategoryId } from '../domain/ids'
import type { Category } from '../domain/types'
import { Notice, useToast } from './ui'

/** Quante spese usano ogni categoria, adesso. */
function useCounts(): Map<string, number> {
  const { dataset } = useStore()
  return useMemo(() => {
    const counts = new Map<string, number>()
    for (const expense of dataset?.expenses ?? []) {
      counts.set(expense.category, (counts.get(expense.category) ?? 0) + 1)
    }
    return counts
  }, [dataset?.expenses])
}

/**
 * Icona e nome: gli stessi due campi per una categoria che nasce e per una che
 * si rinomina. Scritti due volte, il giorno che uno dei due cresce l'altro resta
 * indietro.
 */
function NameFields({
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

function SlotSelect({
  categories,
  category,
  onChange,
}: {
  categories: readonly Category[]
  category: Category
  onChange: (slot: number | undefined) => void
}): ReactNode {
  return (
    <select
      className="select"
      style={{ width: 'auto' }}
      value={category.slot ?? ''}
      aria-label={`Colore di ${category.label}`}
      onChange={(event) =>
        onChange(event.target.value === '' ? undefined : Number(event.target.value))
      }
    >
      <option value="">Nessun colore</option>
      {Array.from({ length: SLOT_COUNT }, (_unused, slot) => {
        const holder = categories.find((c) => c.slot === slot)
        const held = holder && holder.id !== category.id ? ` — oggi ${holder.label}` : ''
        return (
          <option key={slot} value={slot}>
            Colore {slot + 1}
            {held}
          </option>
        )
      })}
    </select>
  )
}

export function CategoryEditor({ lookup }: { lookup: CategoryLookup }): ReactNode {
  const { config, setCategories, recategorize } = useStore()
  const toast = useToast()
  const counts = useCounts()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [emoji, setEmoji] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [moveTo, setMoveTo] = useState('')
  const [creating, setCreating] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newEmoji, setNewEmoji] = useState('')

  if (!config) return null
  const categories = config.categories

  const startEdit = (category: Category): void => {
    setEditingId(category.id)
    setLabel(category.label)
    setEmoji(category.emoji ?? '')
    setDeletingId(null)
  }

  const saveEdit = (): void => {
    const trimmed = label.trim()
    if (trimmed === '') {
      toast.show('Serve un nome per la categoria.')
      return
    }
    setCategories(
      categories.map((category) => {
        if (category.id !== editingId) return category
        const next: Category = { ...category, label: trimmed }
        if (emoji.trim()) next.emoji = emoji.trim()
        else delete next.emoji
        return next
      }),
    )
    setEditingId(null)
    toast.show('Categoria aggiornata.')
  }

  const create = (): void => {
    const trimmed = newLabel.trim()
    if (trimmed === '') {
      toast.show('Serve un nome per la categoria.')
      return
    }
    const taken = new Set(categories.map((c) => c.id))
    const category: Category = { id: newCategoryId(trimmed, taken), label: trimmed }
    if (newEmoji.trim()) category.emoji = newEmoji.trim()
    setCategories([...categories, category])
    setCreating(false)
    setNewLabel('')
    setNewEmoji('')
    toast.show(`Categoria «${trimmed}» creata. Nasce senza colore: puoi dargliene uno qui sotto.`)
  }

  const remove = (category: Category): void => {
    const used = counts.get(category.id) ?? 0
    if (used > 0) {
      if (!moveTo) {
        toast.show('Scegli dove spostare le spese.')
        return
      }
      /* Prima lo spostamento, poi la cancellazione: partono nello stesso
         salvataggio, ma in quest'ordine anche l'anteprima locale resta coerente. */
      recategorize(category.id, moveTo)
    }
    setCategories(categoriesWithout(categories, category.id))
    setDeletingId(null)
    setMoveTo('')
    toast.show(
      used > 0
        ? `«${category.label}» cancellata, ${used} ${used === 1 ? 'spesa spostata' : 'spese spostate'}.`
        : `«${category.label}» cancellata.`,
    )
  }

  /* Le categorie a cui l'app fa riferimento per nome non si cancellano: senza,
     la pagina del gatto e le fette di un viaggio non saprebbero cosa guardare. */
  const locked = new Map<string, string>([
    [config.catCategory, 'la pagina del gatto'],
    [config.tripCategory, 'le fette dei viaggi'],
    [config.houseCategory, 'la pagina Casa'],
  ])

  return (
    <div className="stack" style={{ gap: 10 }}>
      {categories.map((category) => {
        const used = counts.get(category.id) ?? 0
        const lockedBy = locked.get(category.id)
        return (
          <div className="stack" key={category.id} style={{ gap: 6 }}>
            <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
              {/* Il conteggio sotto il nome e non accanto: accanto, i nomi lunghi
                  spingono il pulsante a capo e l'elenco diventa un misto di righe
                  alte 44 e 79 pixel. È lo stesso impianto delle righe di spesa. */}
              <span className="stack" style={{ gap: 1, minWidth: 0 }}>
                <span className="row" style={{ gap: 8, minWidth: 0 }}>
                  <span
                    className="legend-swatch"
                    style={{ background: lookup.color(category.id) }}
                    aria-hidden="true"
                  />
                  <span>
                    {category.emoji ? `${category.emoji} ` : ''}
                    {category.label}
                  </span>
                </span>
                <span className="hint">
                  {used} {used === 1 ? 'spesa' : 'spese'}
                  {category.subcategories?.length ? ` · ${category.subcategories.length} tipi` : ''}
                  {lookup.hasSlot(category.id) ? '' : ' · in «Altre voci»'}
                </span>
              </span>
              {/* Un'azione sola per riga: due pulsanti su schermo da 390px vanno a
                  capo, e tredici categorie diventano ventisei righe. Il resto —
                  colore, cancellazione — sta dentro il pannello che si apre. */}
              <button
                type="button"
                className="btn btn-sm"
                aria-expanded={editingId === category.id}
                onClick={() => {
                  setDeletingId(null)
                  if (editingId === category.id) setEditingId(null)
                  else startEdit(category)
                }}
              >
                Modifica
              </button>
            </div>

            {editingId === category.id && deletingId !== category.id ? (
              <div className="stack" style={{ gap: 6 }}>
                <NameFields
                  emoji={emoji}
                  label={label}
                  onEmoji={setEmoji}
                  onLabel={setLabel}
                  what="della categoria"
                  emojiHint="🏠"
                  labelHint="Come si chiama"
                />
                <SlotSelect
                  categories={categories}
                  category={category}
                  onChange={(slot) => setCategories(withSlot(categories, category.id, slot))}
                />
                <div className="row row-inline" style={{ gap: 6 }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={saveEdit}>
                    Salva
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => setEditingId(null)}>
                    Annulla
                  </button>
                  {lockedBy ? (
                    <span className="hint" title={`Serve a ${lockedBy}`}>
                      non si cancella: serve a {lockedBy}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        setDeletingId(category.id)
                        setMoveTo('')
                      }}
                    >
                      Cancella
                    </button>
                  )}
                </div>
              </div>
            ) : null}

            {deletingId === category.id ? (
              <div className="stack" style={{ gap: 6 }}>
                {used > 0 ? (
                  <>
                    <p className="hint">
                      {used} {used === 1 ? 'spesa usa' : 'spese usano'} «{category.label}». Dove
                      {used === 1 ? ' la' : ' le'} sposto? Il tipo dentro la categoria si perde: non
                      appartiene alla categoria nuova.
                    </p>
                    <select
                      className="select"
                      value={moveTo}
                      aria-label="Categoria di destinazione"
                      onChange={(event) => setMoveTo(event.target.value)}
                    >
                      <option value="">Scegli…</option>
                      {categoriesWithout(categories, category.id).map((other) => (
                        <option key={other.id} value={other.id}>
                          {other.emoji ? `${other.emoji} ` : ''}
                          {other.label}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <p className="hint">Nessuna spesa la usa: si cancella e non si sposta niente.</p>
                )}
                <div className="row row-inline" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={used > 0 && moveTo === ''}
                    onClick={() => remove(category)}
                  >
                    Cancella
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => setDeletingId(null)}>
                    Annulla
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )
      })}

      {creating ? (
        <div className="stack" style={{ gap: 6 }}>
          <NameFields
            emoji={newEmoji}
            label={newLabel}
            onEmoji={setNewEmoji}
            onLabel={setNewLabel}
            what="della nuova categoria"
            emojiHint="🎈"
            labelHint="Come si chiama"
          />
          <div className="row row-inline" style={{ gap: 6 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={create}>
              Crea
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setCreating(false)}>
              Annulla
            </button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button type="button" className="btn btn-sm" onClick={() => setCreating(true)}>
            Nuova categoria
          </button>
        </div>
      )}

      {config.github?.configPath ? null : (
        <Notice tone="warn">
          Manca <code>github.configPath</code> in <code>data/config.json</code>: le modifiche alle
          categorie restano su questo dispositivo e non arrivano nel repo.
        </Notice>
      )}
    </div>
  )
}
