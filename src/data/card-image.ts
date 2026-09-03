/**
 * Dalla foto scelta nella galleria alla faccia di una tessera.
 *
 * **Il ridimensionamento non è una comodità, è obbligatorio.** Una carta
 * attraversa la coda in `localStorage`, dove il browser concede circa cinque
 * megabyte in tutto: una foto da quattro megabyte presa dalla galleria di un
 * telefono la riempie da sola, e quando `localStorage` è pieno la coda non si
 * salva più — cioè le modifiche fatte offline si perdono, in silenzio. Il tetto
 * di `MAX_IMAGE_CHARS` è la stessa cosa vista dal lato della validazione.
 * → ADR-0082
 *
 * **PNG o JPEG, si tiene il più piccolo.** Non è indecisione: le due strade
 * vincono su due contenuti opposti, e le facce delle tessere sono di entrambi i
 * tipi. Un rettangolo di tinta piatta con un logo — il caso normale, perché
 * queste immagini sono ritagli di tessere — in PNG sta in pochi kilobyte e in
 * JPEG prende gli aloni intorno alle lettere bianche; la foto di una tessera di
 * plastica con i riflessi fa l'opposto. Provarle entrambe e misurare costa due
 * chiamate al canvas e toglie una scelta a indovinare.
 */

import { MAX_IMAGE_CHARS } from '../domain/cards'

/**
 * Le riduzioni da provare, in ordine: la prima che rispetta il tetto vince.
 *
 * Si parte da quattrocento pixel di larghezza. Una tessera nella griglia misura
 * circa 180 punti su un telefono, quindi 360 pixel la coprono al doppio della
 * densità e 540 al triplo: quattrocento è il compromesso — nitida su ogni
 * telefono in circolazione, e un quarto dei pixel dell'immagine che arriva
 * dalla galleria. Le altre misure servono solo se la prima pesa troppo.
 */
const FALLBACKS: { width: number; quality: number }[] = [
  { width: 400, quality: 0.82 },
  { width: 320, quality: 0.74 },
  { width: 260, quality: 0.62 },
  { width: 200, quality: 0.5 },
]

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Non riesco a leggere quell’immagine.'))
    }
    image.src = url
  })
}

/** Disegna a una certa larghezza e restituisce i due data URI possibili. */
function encode(
  image: HTMLImageElement,
  width: number,
  quality: number,
): { png: string; jpeg: string } | undefined {
  const ratio = image.naturalHeight / image.naturalWidth
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(width * ratio))
  const context = canvas.getContext('2d')
  if (!context) return undefined
  /* Il fondo bianco conta: un PNG con trasparenza diventerebbe nero passando
     per il JPEG, e la faccia di una tessera non ha motivo di essere trasparente. */
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return {
    png: canvas.toDataURL('image/png'),
    jpeg: canvas.toDataURL('image/jpeg', quality),
  }
}

/**
 * La faccia pronta da salvare, o un errore a parole.
 *
 * Si prova la misura piena e si scende solo se serve: la prima riuscita vince,
 * quindi il caso normale — un ritaglio di tessera — passa al primo giro alla
 * risoluzione migliore.
 */
export async function cardFaceFrom(file: File): Promise<{ image: string } | { problem: string }> {
  if (!file.type.startsWith('image/')) {
    return { problem: 'Quello non è un file di immagine.' }
  }
  let image: HTMLImageElement
  try {
    image = await loadImage(file)
  } catch (error) {
    return {
      problem: error instanceof Error ? error.message : 'Immagine illeggibile.',
    }
  }

  /*
   * **Un'immagine senza dimensioni proprie non si può ridisegnare**, e va detto
   * qui. `accept="image/*"` accetta anche gli SVG, che spesso non dichiarano una
   * misura: `naturalWidth` è zero, il rapporto diventa `NaN`, la tela finisce a
   * zero pixel — e per specifica `toDataURL` su una tela vuota risponde
   * `"data:,"`, sei caratteri che passano allegramente sotto il tetto e
   * finiscono nel dato come faccia della tessera. Il salvataggio poi falliva con
   * «deve essere un PNG, JPEG o WebP», che non nomina la causa e non dice cosa
   * fare.
   */
  if (image.naturalWidth === 0 || image.naturalHeight === 0) {
    return {
      problem: 'Quell’immagine non dichiara una dimensione. Salvala come PNG o JPEG e riprova.',
    }
  }

  for (const step of FALLBACKS) {
    const encoded = encode(image, step.width, step.quality)
    if (!encoded) return { problem: 'Il browser non mi lascia ridimensionare l’immagine.' }
    const best = encoded.png.length <= encoded.jpeg.length ? encoded.png : encoded.jpeg
    /* Il prefisso si controlla: un browser che non sa codificare quel tipo torna
       un data URI di un altro tipo, o `"data:,"`, e nessuno dei due è una faccia. */
    if (!/^data:image\/(png|jpeg);base64,/.test(best)) {
      return { problem: 'Il browser non ha saputo convertire quell’immagine.' }
    }
    if (best.length <= MAX_IMAGE_CHARS) return { image: best }
  }

  return {
    problem:
      'Quell’immagine resta troppo grande anche rimpicciolita. Ritagliala sulla tessera e riprova.',
  }
}

/**
 * Il colore dominante dei **bordi** di una faccia, dai suoi pixel RGBA.
 *
 * **Il colore più frequente, non la media.** La media di un logo bianco su
 * fondo rosso è un rosa sbiadito che non somiglia a nessuna delle due tinte;
 * il più frequente è il rosso, che è il colore del marchio. I canali si
 * arrotondano a passi di 24 prima di contare, altrimenti la compressione JPEG —
 * che sposta ogni pixel di un paio di valori — spezzerebbe il fondo in
 * mille tinte quasi identiche e nessuna vincerebbe. Si guardano i bordi e non
 * il centro: al centro c'è il logo, sul bordo c'è la tinta della tessera.
 *
 * È pura ed esportata perché ha un gemello: `scripts/lib/card-color.mjs` fa lo
 * stesso conto sui pixel di `sharp` durante l'import, e un test di parità li
 * mette davanti allo stesso buffer. Un cambiamento va fatto ai due lati.
 */
export function edgeColor(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): string | undefined {
  const step = 24
  const margin = Math.max(1, Math.round(height * 0.22))
  const counts = new Map<string, number>()
  for (let y = 0; y < height; y += 1) {
    /* Solo la fascia alta e quella bassa: il logo sta in mezzo. */
    if (y >= margin && y < height - margin) continue
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      const key = [0, 1, 2]
        .map((offset) => Math.min(255, Math.round((data[i + offset] ?? 0) / step) * step))
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  let best: string | undefined
  let most = 0
  for (const [color, count] of counts) {
    if (count > most) {
      most = count
      best = color
    }
  }
  return best === undefined ? undefined : `#${best}`
}

/** Il colore della fascia della tessera aperta, letto dalla faccia nel canvas. */
export function dominantColor(dataUri: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      /*
       * Tutto dentro un `try`: `getImageData` **lancia** se la tela è
       * contaminata da un'origine diversa, e senza questa rete la promessa non
       * si risolverebbe mai — il modulo resterebbe fermo su «Sto leggendo…» per
       * sempre, che è peggio di una fascia senza colore.
       */
      try {
        const width = 40
        const height = Math.max(1, Math.round((image.naturalHeight / image.naturalWidth) * width))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) return resolve(undefined)
        context.drawImage(image, 0, 0, width, height)
        const { data } = context.getImageData(0, 0, width, height)
        resolve(edgeColor(data, width, height))
      } catch {
        resolve(undefined)
      }
    }
    image.onerror = () => resolve(undefined)
    image.src = dataUri
  })
}
