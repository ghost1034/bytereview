/**
 * Search result highlighting utilities.
 */

/** Wrap matching substrings with ** markers for downstream rendering. */
export function highlightMatch(text: string, query: string): string {
  const q = query.trim()
  if (!q) return text
  const lower = text.toLowerCase()
  const idx = lower.indexOf(q.toLowerCase())
  if (idx < 0) return text
  return `${text.slice(0, idx)}**${text.slice(idx, idx + q.length)}**${text.slice(idx + q.length)}`
}

/** Extract a one-line snippet around the first match in longer text. */
export function snippetAroundMatch(text: string, query: string, radius = 40): string | undefined {
  const q = query.trim().toLowerCase()
  if (!q) return undefined
  const lower = text.toLowerCase()
  const idx = lower.indexOf(q)
  if (idx < 0) return undefined
  const start = Math.max(0, idx - radius)
  const end = Math.min(text.length, idx + q.length + radius)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return `${prefix}${text.slice(start, end)}${suffix}`
}

/** Split highlighted text into plain and bold segments. */
export function splitHighlight(text: string, query: string): Array<{ bold: boolean; text: string }> {
  const marked = highlightMatch(text, query)
  const parts = marked.split(/\*\*(.*?)\*\*/g)
  return parts.map((part, i) => ({ bold: i % 2 === 1, text: part }))
}
