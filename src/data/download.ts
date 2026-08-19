/** Salvataggio di un file dal browser e copia negli appunti. */

export function downloadText(
  filename: string,
  text: string,
  mime = 'text/plain;charset=utf-8',
  /** Excel in italiano apre un CSV UTF-8 correttamente solo se trova il BOM. */
  withBom = false,
): void {
  const blob = new Blob([withBom ? `﻿${text}` : text], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
