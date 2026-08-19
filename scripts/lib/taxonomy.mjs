/**
 * La tassonomia delle categorie, in un posto solo.
 *
 * Esiste perché la stessa struttura serve in due file diversi: `data/config.json`
 * (i dati veri, fuori da git, con entrate e token) e `data-example/config.json`
 * (generato dal seed, dentro git). Prima erano due copie scritte a mano e sono
 * divergite in silenzio: il seed produceva categorie che la validazione non
 * conosceva più. Ora il seed importa da qui, e `npm run validate` confronta
 * questa con quella dei dati veri e avvisa se non combaciano.
 *
 * L'ordine delle categorie con `slot` è anche l'ordine dei colori, validato per
 * contrasto e daltonismo: non si riordina a occhio. → ADR-0009
 */

export const CATEGORIES = [
  {
    id: 'casa',
    label: 'Casa',
    emoji: '🏠',
    slot: 0,
    subcategories: [
      { id: 'affitto', label: 'Affitto' },
      { id: 'bollette', label: 'Bollette' },
      { id: 'manutenzione', label: 'Manutenzione' },
      { id: 'arredo', label: 'Arredo e casalinghi' },
      { id: 'prodotti', label: 'Prodotti per la casa' },
      { id: 'domestico', label: 'Aiuto domestico' },
    ],
  },
  { id: 'spesa', label: 'Spesa alimentare', emoji: '🛒', slot: 1 },
  {
    id: 'ristoranti',
    label: 'Bar e ristoranti',
    emoji: '🍝',
    slot: 2,
    subcategories: [
      { id: 'colazione', label: 'Colazioni e caffè' },
      { id: 'pranzo', label: 'Pranzi' },
      { id: 'cena', label: 'Cene' },
      { id: 'aperitivi', label: 'Aperitivi e drink' },
      { id: 'gelato', label: 'Gelati e dolci' },
      { id: 'consegna', label: 'Consegna a domicilio' },
    ],
  },
  {
    id: 'gatto',
    label: 'Il gatto',
    emoji: '🐈',
    slot: 3,
    subcategories: [
      { id: 'cibo', label: 'Cibo' },
      { id: 'veterinario', label: 'Veterinario' },
      { id: 'lettiera', label: 'Lettiera' },
      { id: 'accessori', label: 'Accessori e giochi' },
    ],
  },
  {
    id: 'trasporti',
    label: 'Trasporti',
    emoji: '🚗',
    slot: 4,
    subcategories: [
      { id: 'carburante', label: 'Carburante' },
      { id: 'autostrada', label: 'Autostrada e pedaggi' },
      { id: 'parcheggi', label: 'Parcheggi e lavaggi' },
      { id: 'auto', label: 'Bollo, assicurazione, officina' },
      { id: 'mezzi', label: 'Treni e mezzi' },
    ],
  },
  {
    id: 'salute',
    label: 'Salute',
    emoji: '💊',
    slot: 5,
    subcategories: [
      { id: 'psicologo', label: 'Psicologo' },
      { id: 'farmacia', label: 'Farmacia' },
      { id: 'visite', label: 'Visite ed esami' },
      { id: 'occhiali', label: 'Occhiali e lenti' },
      { id: 'cura', label: 'Cura personale' },
    ],
  },
  /*
   * Il viola (slot 6) va a «tempo libero», che è la seconda voce per volume e
   * merita una tinta netta. Al rosso, ultimo slot, restano i regali: in un'app
   * di spese il rosso somiglia a un allarme, quindi ci va una categoria che fa
   * fette piccole e stagionali.
   */
  {
    id: 'tempolibero',
    label: 'Tempo libero',
    emoji: '🎯',
    slot: 6,
    subcategories: [
      { id: 'sport', label: 'Sport' },
      { id: 'manga', label: 'Manga e figure' },
      { id: 'videogiochi', label: 'Videogiochi' },
      { id: 'tavolo', label: 'Giochi da tavolo' },
      { id: 'musica', label: 'Libri, vinili, musica' },
      { id: 'abbonamenti', label: 'Abbonamenti' },
      { id: 'spettacoli', label: 'Cinema e concerti' },
      { id: 'fiere', label: 'Fiere ed eventi' },
    ],
  },
  { id: 'regali', label: 'Regali', emoji: '🎁', slot: 7 },
  /*
   * «viaggi» non ha slot di proposito: le spese di vacanza stanno fuori dalle
   * statistiche mensili (ADR-0010), e dentro un viaggio il grafico si spezza per
   * sottocategoria con una rampa a un colore — un colore fisso non servirebbe.
   */
  {
    id: 'viaggi',
    label: 'Viaggi',
    emoji: '✈️',
    subcategories: [
      { id: 'alloggio', label: 'Alloggio' },
      { id: 'trasporti', label: 'Voli, treni, benzina' },
      { id: 'attivita', label: 'Attività e visite' },
      { id: 'cibo', label: 'Mangiare in viaggio' },
      { id: 'souvenir', label: 'Souvenir e regali' },
    ],
  },
  { id: 'abbigliamento', label: 'Abbigliamento', emoji: '👕' },
  { id: 'telefonia', label: 'Telefonia e internet', emoji: '📱' },
  { id: 'tecnologia', label: 'Tecnologia', emoji: '💻' },
  { id: 'burocrazia', label: 'Tasse e burocrazia', emoji: '📄' },
  { id: 'altro', label: 'Altro', emoji: '▫️' },
]

export const CAT_CATEGORY = 'gatto'
export const TRIP_CATEGORY = 'viaggi'

/** Firma stabile della tassonomia: serve a confrontare due copie. */
export function taxonomyFingerprint(categories) {
  return (categories ?? [])
    .map(
      (category) =>
        `${category.id}:${category.slot ?? '-'}:${(category.subcategories ?? [])
          .map((sub) => sub.id)
          .sort()
          .join(',')}`,
    )
    .sort()
    .join('|')
}
