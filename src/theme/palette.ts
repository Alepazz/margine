/**
 * Palette dei grafici, in TypeScript perché Recharts vuole colori veri e non
 * variabili CSS. Gli stessi valori stanno in `styles/tokens.css` per l'interfaccia.
 *
 * L'ordine delle serie è fisso e validato (checks di banda di luminosità, croma,
 * separazione per daltonismo e contrasto) su entrambe le superfici reali
 * dell'app: #ffffff in chiaro, #161d23 in scuro. Non riordinare a occhio.
 *
 * In tema chiaro tre tinte (verde acqua, giallo, magenta) stanno sotto 3:1 sulla
 * carta: per questo ogni grafico porta sempre le etichette con i valori accanto
 * (o una tabella), mai il colore da solo.
 */

export interface ChartTheme {
  /** Otto tinte categoriali, ordine fisso. */
  series: readonly string[]
  /** Tinta neutra della fetta «Altre». */
  rest: string
  /** Rampa sequenziale (chiaro → scuro) per le serie singole. */
  seq: readonly string[]
  grid: string
  axis: string
  muted: string
  ink: string
  surface: string
  good: string
  warn: string
  critical: string
}

export const LIGHT_CHART: ChartTheme = {
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  rest: '#9aa7b1',
  seq: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#2a78d6', '#256abf', '#184f95'],
  grid: '#dce3e9',
  axis: '#c3cdd5',
  muted: '#77848d',
  ink: '#101820',
  surface: '#ffffff',
  good: '#0ca30c',
  warn: '#fab219',
  critical: '#d03b3b',
}

export const DARK_CHART: ChartTheme = {
  series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  rest: '#63737f',
  seq: ['#184f95', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#86b6ef', '#b7d3f6'],
  grid: '#26313a',
  axis: '#35424c',
  muted: '#7c8b95',
  ink: '#e9eff3',
  surface: '#161d23',
  good: '#0ca30c',
  warn: '#fab219',
  critical: '#d03b3b',
}

/** Colore della serie singola: un blu che tiene su entrambe le carte. */
export function primarySeries(theme: ChartTheme): string {
  return theme.series[0] ?? '#2a78d6'
}
