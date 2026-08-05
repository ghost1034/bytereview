/**
 * Export dashboard grid as PNG using html2canvas.
 */
import { normalizeUnknownError } from '../errors'

export async function exportDashboardPng(element: HTMLElement, filename: string): Promise<void> {
  try {
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(element, {
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      scale: 2,
    })
    const link = document.createElement('a')
    link.download = filename
    link.href = canvas.toDataURL('image/png')
    link.click()
  } catch (cause) {
    throw normalizeUnknownError(
      cause,
      'The dashboard could not be exported. An image or other page asset may have failed to load.'
    )
  }
}

/** Trigger browser print dialog for PDF export via print CSS. */
export function exportDashboardPrint(): void {
  window.print()
}
