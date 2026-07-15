import type { InkwiseBibliographicMetadata, InkwiseCitation, InkwiseCitationStyle } from '@/lib/api'

export const INKWISE_CITATION_STYLE_OPTIONS: Array<{ value: InkwiseCitationStyle; label: string }> = [
  { value: 'default', label: 'Default' },
  { value: 'apa', label: 'APA' },
  { value: 'mla', label: 'MLA' },
  { value: 'chicago', label: 'Chicago' },
  { value: 'bluebook', label: 'Bluebook' },
  { value: 'none', label: 'No Citation Needed' },
]

export function normalizeInkwiseCitationStyle(value?: string | null): InkwiseCitationStyle {
  switch ((value || '').trim().toLowerCase()) {
    case 'apa':
    case 'mla':
    case 'chicago':
    case 'bluebook':
    case 'none':
      return value!.trim().toLowerCase() as InkwiseCitationStyle
    default:
      return 'default'
  }
}

export function citationStyleRequiresVisibleReferences(style?: string | null): boolean {
  return normalizeInkwiseCitationStyle(style) !== 'none'
}

export function formatInlineCitationText(citations: InkwiseCitation[], style?: string | null): string {
  if (!citationStyleRequiresVisibleReferences(style)) return ''
  const items = dedupeCitations(citations).map((citation) => formatInlineItem(citation, style)).filter(Boolean)
  return items.length ? ` (${items.join('; ')})` : ''
}

export function formatNoteCitationText(citations: InkwiseCitation[], style?: string | null): string {
  if (!citationStyleRequiresVisibleReferences(style)) return ''
  const normalizedStyle = normalizeInkwiseCitationStyle(style)
  const items = dedupeCitations(citations).map((citation) => formatNoteItem(citation, normalizedStyle)).filter(Boolean)
  return normalizedStyle === 'default' ? items.join('; ') : items.join(' ')
}

function dedupeCitations(citations: InkwiseCitation[]): InkwiseCitation[] {
  const seen = new Set<string>()
  const items: InkwiseCitation[] = []
  for (const citation of citations) {
    const key = String(citation?.evidence_id || `${citation?.source_id || 'source'}:${citation?.page_number || ''}:${citation?.excerpt || ''}`)
    if (!key || seen.has(key)) continue
    seen.add(key)
    items.push(citation)
  }
  return items
}

function formatInlineItem(citation: InkwiseCitation, style?: string | null): string {
  const normalizedStyle = normalizeInkwiseCitationStyle(style)
  if (normalizedStyle === 'apa') return formatApaInline(citation)
  if (normalizedStyle === 'mla') return formatMlaInline(citation)
  if (normalizedStyle === 'chicago') return formatChicagoInline(citation)
  if (normalizedStyle === 'bluebook') return formatBluebookInline(citation)
  return formatDefaultInline(citation)
}

function formatNoteItem(citation: InkwiseCitation, style: InkwiseCitationStyle): string {
  if (style === 'apa') return ensureTerminalPeriod(formatApaNote(citation))
  if (style === 'mla') return ensureTerminalPeriod(formatMlaNote(citation))
  if (style === 'chicago') return ensureTerminalPeriod(formatChicagoNote(citation))
  if (style === 'bluebook') return ensureTerminalPeriod(formatBluebookNote(citation))
  return formatDefaultNote(citation)
}

function formatDefaultInline(citation: InkwiseCitation): string {
  return [titleForCitation(citation), defaultLocator(citation)].filter(Boolean).join(' ')
}

function formatDefaultNote(citation: InkwiseCitation): string {
  return formatDefaultInline(citation)
}

function formatApaInline(citation: InkwiseCitation): string {
  const author = authorShort(citation)
  const year = yearValue(citation)
  const locator = apaLocator(citation)
  const body = [author, year].filter(Boolean).join(', ')
  if (locator) return body ? `${body}, ${locator}` : locator
  return body || titleForCitation(citation)
}

function formatApaNote(citation: InkwiseCitation): string {
  const metadata = metadataFor(citation)
  return [authorFull(citation), yearValue(citation) ? `(${yearValue(citation)})` : '', text(metadata.title) || titleForCitation(citation), text(metadata.publisher), apaLocator(citation)]
    .filter(Boolean)
    .map((part) => String(part).replace(/[.]+$/, ''))
    .join('. ')
}

function formatMlaInline(citation: InkwiseCitation): string {
  return [authorShort(citation) || shortTitle(citation), mlaLocator(citation)].filter(Boolean).join(' ')
}

function formatMlaNote(citation: InkwiseCitation): string {
  const metadata = metadataFor(citation)
  return [authorFull(citation), text(metadata.title) || titleForCitation(citation), text(metadata.container_title), text(metadata.publisher), yearValue(citation), defaultLocator(citation)]
    .filter(Boolean)
    .join(', ')
}

function formatChicagoInline(citation: InkwiseCitation): string {
  const body = [authorShort(citation), yearValue(citation)].filter(Boolean).join(' ')
  const locator = chicagoLocator(citation)
  if (locator) return body ? `${body}, ${locator}` : locator
  return body || shortTitle(citation)
}

function formatChicagoNote(citation: InkwiseCitation): string {
  const metadata = metadataFor(citation)
  const core = [text(metadata.publisher), yearValue(citation)].filter(Boolean).join(', ')
  return [authorFull(citation), text(metadata.title) || titleForCitation(citation), core ? `(${core})` : '', chicagoLocator(citation)]
    .filter(Boolean)
    .join(', ')
}

function formatBluebookInline(citation: InkwiseCitation): string {
  const caseCitation = bluebookCaseCitation(citation)
  if (caseCitation) return caseCitation
  const year = yearValue(citation)
  const body = [text(metadataFor(citation).title) || titleForCitation(citation), bluebookLocator(citation)].filter(Boolean).join(', ')
  return year ? `${body} (${year})` : body
}

function formatBluebookNote(citation: InkwiseCitation): string {
  const caseCitation = bluebookCaseCitation(citation)
  if (caseCitation) return caseCitation
  const body = [authorFull(citation), text(metadataFor(citation).title) || titleForCitation(citation), bluebookLocator(citation) ? `at ${bluebookLocator(citation)}` : '']
    .filter(Boolean)
    .join(', ')
  return yearValue(citation) ? `${body} (${yearValue(citation)})` : body
}

function bluebookCaseCitation(citation: InkwiseCitation): string {
  const metadata = metadataFor(citation)
  if (text(metadata.citation_type) !== 'case') return ''
  const cite = [text(metadata.reporter_volume), text(metadata.reporter), text(metadata.first_page)].filter(Boolean).join(' ')
  const pin = text(metadata.pin_cite) || locatorNumber(citation)
  let body = cite ? `${text(metadata.title) || titleForCitation(citation)}, ${cite}` : (text(metadata.title) || titleForCitation(citation))
  if (pin) body = `${body}, ${pin}`
  const parenthetical = [text(metadata.court), yearValue(citation)].filter(Boolean).join(' ')
  if (parenthetical) body = `${body} (${parenthetical})`
  return body
}

function metadataFor(citation: InkwiseCitation): InkwiseBibliographicMetadata {
  return citation.bibliographic_metadata || {}
}

function authors(citation: InkwiseCitation): string[] {
  return Array.isArray(metadataFor(citation).authors) ? (metadataFor(citation).authors || []).map((item) => text(item)).filter(Boolean) : []
}

function authorShort(citation: InkwiseCitation): string {
  const items = authors(citation)
  if (!items.length) return shortTitle(citation)
  const first = lastName(items[0])
  if (items.length > 2) return `${first} et al.`
  if (items.length === 2) return `${first} & ${lastName(items[1])}`
  return first
}

function authorFull(citation: InkwiseCitation): string {
  const items = authors(citation)
  if (!items.length) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

function titleForCitation(citation: InkwiseCitation): string {
  return text(metadataFor(citation).title) || text(citation.source_title) || 'Evidence'
}

function shortTitle(citation: InkwiseCitation): string {
  return text(metadataFor(citation).short_title) || titleForCitation(citation)
}

function yearValue(citation: InkwiseCitation): string {
  return text(metadataFor(citation).year)
}

function defaultLocator(citation: InkwiseCitation): string {
  const locator = locatorNumber(citation)
  return locator ? `${isMultiplePageLocator(locator) ? 'pp.' : 'p.'}${locator}` : ''
}

function apaLocator(citation: InkwiseCitation): string {
  const locator = locatorNumber(citation)
  if (!locator) return ''
  return isMultiplePageLocator(locator) ? `pp. ${locator}` : `p. ${locator}`
}

function mlaLocator(citation: InkwiseCitation): string {
  return locatorNumber(citation)
}

function chicagoLocator(citation: InkwiseCitation): string {
  return locatorNumber(citation)
}

function bluebookLocator(citation: InkwiseCitation): string {
  return text(metadataFor(citation).pin_cite) || locatorNumber(citation)
}

function locatorNumber(citation: InkwiseCitation): string {
  const explicit = text(metadataFor(citation).pin_cite)
  if (explicit) return explicit
  const locator = citation.locator_json || {}
  const pageNumbers = normalizedPageNumbers(locator.page_numbers)
  if (pageNumbers.length) return formatPageNumbers(pageNumbers)
  const pageStart = integer(locator.page_start)
  const pageEnd = integer(locator.page_end)
  if (pageStart && pageEnd && pageEnd !== pageStart) return `${pageStart}-${pageEnd}`
  if (pageStart) return String(pageStart)
  const pageNumber = integer(citation.page_number)
  return pageNumber ? String(pageNumber) : ''
}

function isMultiplePageLocator(locator: string): boolean {
  return locator.includes('-') || locator.includes(',')
}

function normalizedPageNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map(integer).filter((item): item is number => item !== null))).sort((a, b) => a - b)
}

function formatPageNumbers(pageNumbers: number[]): string {
  const ranges: string[] = []
  let start = pageNumbers[0]
  let end = start
  for (const pageNumber of pageNumbers.slice(1)) {
    if (pageNumber === end + 1) {
      end = pageNumber
      continue
    }
    ranges.push(start === end ? String(start) : `${start}-${end}`)
    start = pageNumber
    end = pageNumber
  }
  if (start !== undefined) ranges.push(start === end ? String(start) : `${start}-${end}`)
  return ranges.join(', ')
}

function lastName(value?: string | null): string {
  const cleaned = text(value)
  if (!cleaned) return ''
  if (cleaned.includes(',')) return cleaned.split(',', 1)[0]?.trim() || cleaned
  const parts = cleaned.split(/\s+/)
  return parts[parts.length - 1] || cleaned
}

function ensureTerminalPeriod(value: string): string {
  const cleaned = value.trim()
  if (!cleaned) return ''
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`
}

function text(value?: string | null): string {
  return String(value || '').trim()
}

function integer(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : null
}
