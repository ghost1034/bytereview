/**
 * Export dashboard grid as PNG using html2canvas.
 */
export async function exportDashboardPng(element: HTMLElement, filename: string): Promise<void> {
  const html2canvas = (await import('html2canvas')).default
  const canvas = await html2canvas(element, {
    backgroundColor: getComputedStyle(document.body).backgroundColor,
    scale: 2,
  })
  const link = document.createElement('a')
  link.download = filename
  link.href = canvas.toDataURL('image/png')
  link.click()
}

/** Trigger browser print dialog for PDF export via print CSS. */
export function exportDashboardPrint(): void {
  window.print()
}
