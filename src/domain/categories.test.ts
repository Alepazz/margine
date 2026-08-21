import { describe, expect, it } from 'vitest'

import {
  SLOT_COUNT,
  buildCategoryLookup,
  categoriesWithout,
  withSlot,
} from './categories'
import { tricountTitleOf, tripTitleOf, tripsOf, type Category, type Tricount } from './types'
import { LIGHT_CHART } from '../theme/palette'

const CATEGORIES: Category[] = [
  { id: 'casa', label: 'Casa', emoji: '🏠', slot: 0 },
  { id: 'spesa', label: 'Spesa', emoji: '🛒', slot: 1 },
  { id: 'auto', label: 'Auto', emoji: '🚗', slot: 4 },
  { id: 'mezzi', label: 'Treni e mezzi', emoji: '🚆' },
  { id: 'altro', label: 'Altro' },
]

function slotsOf(categories: readonly Category[]): Record<string, number | undefined> {
  return Object.fromEntries(categories.map((c) => [c.id, c.slot]))
}

describe('slot di colore', () => {
  it('una categoria senza slot non ha colore proprio', () => {
    const lookup = buildCategoryLookup(CATEGORIES, LIGHT_CHART)
    expect(lookup.hasSlot('casa')).toBe(true)
    expect(lookup.hasSlot('mezzi')).toBe(false)
    expect(lookup.color('mezzi')).toBe(LIGHT_CHART.rest)
  })

  /*
   * Il difetto che questo test presidia: prima lo slot si ereditava dalla
   * posizione nell'elenco, quindi la quarta categoria senza slot prendeva il
   * colore 3 — lo stesso di chi lo aveva dichiarato. Invisibile finché le prime
   * otto avevano tutte uno slot, raggiungibile appena si crea una categoria.
   */
  it('non prende il colore dalla propria posizione nell’elenco', () => {
    const shuffled: Category[] = [
      { id: 'nuova', label: 'Nuova' },
      ...CATEGORIES,
    ]
    const lookup = buildCategoryLookup(shuffled, LIGHT_CHART)
    expect(lookup.color('nuova')).toBe(LIGHT_CHART.rest)
    expect(lookup.color('casa')).toBe(LIGHT_CHART.series[0])
  })

  it('assegnare uno slot già preso lo scambia, senza duplicarlo', () => {
    const next = withSlot(CATEGORIES, 'mezzi', 0)
    expect(slotsOf(next)).toMatchObject({ mezzi: 0, casa: undefined })
    /* L'invariante vero: nessuno slot appartiene a due categorie. */
    const used = next.map((c) => c.slot).filter((slot) => slot !== undefined)
    expect(new Set(used).size).toBe(used.length)
  })

  it('scambiando due categorie che hanno entrambe uno slot, se lo passano', () => {
    const next = withSlot(CATEGORIES, 'auto', 1)
    expect(slotsOf(next)).toMatchObject({ auto: 1, spesa: 4 })
  })

  it('togliere lo slot lo lascia libero per un’altra', () => {
    const senza = withSlot(CATEGORIES, 'casa', undefined)
    expect(slotsOf(senza).casa).toBeUndefined()
    const poi = withSlot(senza, 'mezzi', 0)
    expect(slotsOf(poi)).toMatchObject({ mezzi: 0, casa: undefined })
  })

  it('gli slot stanno dentro la tavolozza', () => {
    expect(SLOT_COUNT).toBe(LIGHT_CHART.series.length)
  })
})

describe('cancellare una categoria', () => {
  it('la toglie e lascia stare le altre', () => {
    const next = categoriesWithout(CATEGORIES, 'mezzi')
    expect(next.map((c) => c.id)).toEqual(['casa', 'spesa', 'auto', 'altro'])
  })
})

describe('nomi dei tricount', () => {
  /* Il nome per l'export e il titolo per i menù sono due cose diverse: un'emoji
     in mezzo a una cella di CSV non serve a nessuno. */
  it('il titolo porta l’emoji, e senza emoji è il nome, senza spazi appesi', () => {
    expect(tricountTitleOf({ name: 'Il nostro tricount', emoji: '🥺' })).toBe('🥺 Il nostro tricount')
    expect(tricountTitleOf({ name: 'Casa' })).toBe('Casa')
    expect(tripTitleOf({ name: 'Parigi', emoji: '🇫🇷' })).toBe('🇫🇷 Parigi')
    expect(tripTitleOf({ name: 'Parigi' })).toBe('Parigi')
  })
})

describe('i viaggi come vista dei tricount', () => {
  const TRICOUNTS: Tricount[] = [
    { id: 'condivise', name: 'Condivise', members: ['me', 'partner'] },
    {
      id: 'parigi-2025',
      name: 'Parigi',
      emoji: '🇫🇷',
      members: ['me', 'partner'],
      closed: true,
      trip: { place: 'Parigi', year: 2025, start: '2025-04-26', end: '2025-05-01', coords: { lat: 48.86, lon: 2.35 } },
    },
  ]

  it('appiattisce solo i tricount che sono viaggi, con tutto quello che serve', () => {
    const trips = tripsOf(TRICOUNTS)
    expect(trips.map((t) => t.id)).toEqual(['parigi-2025'])
    const parigi = trips[0]!
    /* La vista porta identità e viaggio insieme: è quello che leggono la pagina
       Vacanze, il mappamondo e le statistiche. */
    expect(parigi.name).toBe('Parigi')
    expect(parigi.emoji).toBe('🇫🇷')
    expect(parigi.closed).toBe(true)
    expect(parigi.start).toBe('2025-04-26')
    expect(parigi.coords?.lat).toBe(48.86)
  })
})
