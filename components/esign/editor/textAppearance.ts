export const TEXT_FONT_OPTIONS = ['Helvetica', 'Times', 'Courier'] as const

/** Map the PDF-safe font names stored on a field to browser font stacks. */
export function textFontFamily(font = 'Helvetica'): string {
  const normalized = font.toLowerCase()
  if (normalized.includes('times')) return 'Times New Roman, Times, serif'
  if (normalized.includes('courier')) return 'Courier New, Courier, monospace'
  return 'Arial, Helvetica, sans-serif'
}

/** Convert the configured PDF point size to the current rendered page scale. */
export function configuredTextFontSize(
  fontSize: number | null | undefined,
  pageScale: number,
  renderedFieldHeight: number,
): number | undefined {
  if (fontSize == null) return undefined
  return Math.min(fontSize * pageScale, renderedFieldHeight * 0.9)
}

/** Use a compact, PDF-scaled fallback for fields without an explicit point size. */
export function signingTextFontSize(
  fontSize: number | null | undefined,
  pageScale: number,
  renderedFieldHeight: number,
  fallbackPointSize = 10,
): number {
  return configuredTextFontSize(fontSize, pageScale, renderedFieldHeight)
    ?? Math.min(fallbackPointSize * pageScale, renderedFieldHeight * 0.5)
}
