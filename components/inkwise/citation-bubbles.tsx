'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, FileText, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { apiClient, InkwiseCitation, InkwiseCitationHighlight, InkwiseSource } from '@/lib/api'

type CitationReferenceAction = {
  id: string
  label: string
  onClick: () => void | Promise<void>
  variant?: 'default' | 'outline'
}

export function InkwiseCitationBubbles({
  citations,
  bubbleClassName,
  onSheetOpenChange,
  inline = false,
  compactLabels = false,
  referenceActions,
}: {
  citations: InkwiseCitation[]
  bubbleClassName?: string
  onSheetOpenChange?: (open: boolean) => void
  inline?: boolean
  compactLabels?: boolean
  referenceActions?: CitationReferenceAction[]
}) {
  const items = useMemo(() => citations.filter((citation) => Boolean(citation?.evidence_id || citation?.excerpt)), [citations])
  const [open, setOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [source, setSource] = useState<InkwiseSource | null>(null)
  const [loading, setLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionPendingId, setActionPendingId] = useState<string | null>(null)

  const selected = items[selectedIndex] ?? null
  const previewKind = getPreviewKind(selected, source)
  const resolvedPreviewUrl = buildCitationPreviewUrl(previewUrl, selected, source)

  useEffect(() => {
    if (!open || !selected?.source_id) return
    let active = true
    setLoading(true)
    setPreviewError(null)
    setActionError(null)
    setPreviewUrl(null)
    setSource(null)

    Promise.all([
      selected.preview_object
        ? apiClient.previewInkwiseSourceAsset(selected.source_id, {
            bucket: selected.preview_bucket || undefined,
            object_name: selected.preview_object,
            disposition_filename: selected.segment_title || selected.source_title,
          }).catch(() => null)
        : apiClient.previewInkwiseSource(selected.source_id).catch(() => null),
      apiClient.getInkwiseSource(selected.source_id).catch(() => null),
    ])
      .then(([preview, sourceResult]) => {
        if (!active) return
        setPreviewUrl(preview?.url || null)
        setSource(sourceResult)
        if (!preview?.url && !sourceResult) {
          setPreviewError('Could not load the source preview.')
        }
      })
      .catch((error) => {
        if (!active) return
        setPreviewError(error instanceof Error ? error.message : 'Could not load the source preview.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [open, selected?.source_id, selected?.preview_bucket, selected?.preview_object])

  if (!items.length) return null

  const goTo = (index: number) => {
    onSheetOpenChange?.(true)
    setSelectedIndex(index)
    setOpen(true)
  }

  async function runReferenceAction(action: CitationReferenceAction) {
    setActionPendingId(action.id)
    setActionError(null)
    try {
      await action.onClick()
      setOpen(false)
      onSheetOpenChange?.(false)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not convert this reference.')
    } finally {
      setActionPendingId(null)
    }
  }

  const RootTag = inline ? 'span' : 'div'
  const rootClassName = inline ? 'inline-flex flex-wrap gap-2 align-middle' : 'flex flex-wrap gap-2'

  return (
    <>
      <RootTag className={rootClassName}>
        {items.map((citation, index) => (
          <button
            key={`${citation.evidence_id ?? index}-${index}`}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => goTo(index)}
            className={bubbleClassName || 'rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700 transition hover:bg-emerald-200'}
          >
            {compactLabels ? formatCompactCitationLabel(citation) : formatCitationLabel(citation)}
          </button>
        ))}
      </RootTag>

      <Sheet open={open} onOpenChange={(value) => { setOpen(value); onSheetOpenChange?.(value) }}>
        <SheetContent side="right" className="w-full overflow-hidden sm:max-w-2xl">
          {selected ? (
            <div className="flex h-full flex-col">
              <SheetHeader>
                <SheetTitle>{selected.source_title || 'Evidence viewer'}</SheetTitle>
                <SheetDescription>{formatCitationLabel(selected)}</SheetDescription>
              </SheetHeader>

              <div className="mt-4 flex items-center justify-between gap-2 border-b pb-4">
                <div className="text-xs text-slate-500">
                  Evidence {selectedIndex + 1} of {items.length}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSelectedIndex((value) => Math.max(0, value - 1))} disabled={selectedIndex === 0} aria-label="Previous">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSelectedIndex((value) => Math.min(items.length - 1, value + 1))} disabled={selectedIndex >= items.length - 1} aria-label="Next">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {referenceActions?.length ? (
                <div className="mt-4 border-b pb-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Convert Reference</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {referenceActions.map((action) => (
                      <Button
                        key={action.id}
                        size="sm"
                        variant={action.variant || 'outline'}
                        onClick={() => void runReferenceAction(action)}
                        disabled={Boolean(actionPendingId)}
                      >
                        {actionPendingId === action.id ? 'Converting...' : action.label}
                      </Button>
                    ))}
                  </div>
                  {actionError ? <div className="mt-2 text-xs text-red-600">{actionError}</div> : null}
                </div>
              ) : null}

              <ScrollArea className="mt-4 flex-1 pr-2">
                <div className="space-y-4 pb-8">
                  <CitationEvidenceExcerpt key={`${selectedIndex}-${selected.evidence_id ?? ''}`} citation={selected} />

                  <div className="rounded-2xl border p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Locator</div>
                    <div className="mt-2 text-sm text-slate-700">{formatLocatorLabel(selected)}</div>
                    {selected.segment_title ? <div className="mt-2 text-xs text-slate-500">Segment: {selected.segment_title}</div> : null}
                  </div>

                  <div className="rounded-2xl border p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reference Preview</div>
                        <div className="mt-1 text-sm text-slate-700">{source?.original_filename || source?.source_url || selected.source_title || 'Reference'}</div>
                      </div>
                      <div className="flex gap-2">
                        {resolvedPreviewUrl ? (
                          <Button size="sm" variant="outline" onClick={() => window.open(resolvedPreviewUrl, '_blank', 'noopener,noreferrer')}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Open snapshot
                          </Button>
                        ) : null}
                        {source?.source_url ? (
                          <Button size="sm" variant="outline" onClick={() => window.open(source.source_url || '', '_blank', 'noopener,noreferrer')}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Open source
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {loading ? (
                      <div className="flex h-72 items-center justify-center text-sm text-slate-500">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading preview...
                      </div>
                    ) : resolvedPreviewUrl ? (
                      previewKind === 'image' ? (
                        <img
                          alt={selected.source_title || 'Evidence preview'}
                          src={resolvedPreviewUrl}
                          className="max-h-[28rem] w-full rounded-xl border bg-white object-contain"
                        />
                      ) : previewKind === 'audio' ? (
                        <div className="rounded-xl border bg-white p-6">
                          <audio src={resolvedPreviewUrl} controls className="w-full" />
                        </div>
                      ) : previewKind === 'video' ? (
                        <video
                          src={resolvedPreviewUrl}
                          controls
                          className="max-h-[28rem] w-full rounded-xl border bg-black"
                        />
                      ) : previewKind === 'pdf' ? (
                        <iframe
                          title={`Evidence preview ${selected.evidence_id || selectedIndex + 1}`}
                          src={resolvedPreviewUrl}
                          className="h-[28rem] w-full rounded-xl border bg-white"
                        />
                      ) : (
                        <div className="flex h-72 flex-col items-center justify-center rounded-xl border border-dashed text-sm text-slate-500">
                          <FileText className="mb-3 h-5 w-5" />
                          Preview is available in a new tab.
                        </div>
                      )
                    ) : (
                      <div className="flex h-72 flex-col items-center justify-center rounded-xl border border-dashed text-sm text-slate-500">
                        <FileText className="mb-3 h-5 w-5" />
                        {previewError || 'Preview not available for this evidence yet.'}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}

const EXCERPT_CONTEXT_CHARS = 160

function CitationEvidenceExcerpt({ citation }: { citation: InkwiseCitation }) {
  const excerpt = citation.excerpt || ''
  const highlights = useMemo(() => normalizedExcerptHighlights(citation), [citation])
  const [showFull, setShowFull] = useState(false)

  const collapsedStart = highlights.length ? Math.max(0, highlights[0].start - EXCERPT_CONTEXT_CHARS) : 0
  const collapsedEnd = highlights.length ? Math.min(excerpt.length, highlights[highlights.length - 1].end + EXCERPT_CONTEXT_CHARS) : excerpt.length
  const isTrimmable = collapsedStart > 0 || collapsedEnd < excerpt.length
  const from = showFull ? 0 : collapsedStart
  const to = showFull ? excerpt.length : collapsedEnd

  const nodes: ReactNode[] = []
  if (from > 0) nodes.push(<span key="lead-ellipsis" className="text-slate-400">... </span>)
  let cursor = from
  highlights.forEach((highlight, index) => {
    const start = Math.max(highlight.start, from)
    const end = Math.min(highlight.end, to)
    if (end <= cursor || start >= to) return
    if (start > cursor) {
      nodes.push(
        <span key={`context-${index}`} className="text-slate-500">
          {excerpt.slice(cursor, start)}
        </span>,
      )
    }
    nodes.push(
      <mark key={`highlight-${index}`} className="rounded bg-emerald-100 px-0.5 text-emerald-900">
        {excerpt.slice(start, end)}
      </mark>,
    )
    cursor = end
  })
  if (cursor < to) {
    nodes.push(
      <span key="context-tail" className={highlights.length ? 'text-slate-500' : undefined}>
        {excerpt.slice(cursor, to)}
      </span>,
    )
  }
  if (to < excerpt.length) nodes.push(<span key="tail-ellipsis" className="text-slate-400"> ...</span>)

  return (
    <div className="rounded-2xl border bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Evidence
          {highlights.length ? <span className="ml-2 font-normal normal-case tracking-normal text-emerald-700">cited passage highlighted</span> : null}
        </div>
        {highlights.length && isTrimmable ? (
          <button
            type="button"
            onClick={() => setShowFull((value) => !value)}
            className="shrink-0 text-xs font-medium text-emerald-700 hover:underline"
          >
            {showFull ? 'Show cited passage' : 'Show full passage'}
          </button>
        ) : null}
      </div>
      <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{nodes.length ? nodes : 'No excerpt available.'}</div>
    </div>
  )
}

function normalizedExcerptHighlights(citation: InkwiseCitation | null): InkwiseCitationHighlight[] {
  const excerpt = citation?.excerpt || ''
  const spans = (citation?.highlights || [])
    .map((highlight) => ({
      start: Math.max(0, Math.trunc(Number(highlight?.start))),
      end: Math.min(excerpt.length, Math.trunc(Number(highlight?.end))),
    }))
    .filter((highlight) => Number.isFinite(highlight.start) && Number.isFinite(highlight.end) && highlight.end > highlight.start)
    .sort((a, b) => a.start - b.start)

  const merged: InkwiseCitationHighlight[] = []
  for (const span of spans) {
    const last = merged[merged.length - 1]
    if (last && span.start <= last.end) {
      last.end = Math.max(last.end, span.end)
    } else {
      merged.push({ ...span })
    }
  }
  return merged
}

export function formatCitationLabel(citation: InkwiseCitation): string {
  const sourceTitle = formatCitationSourceTitle(citation, { maxLength: 56 })
  const locationLabel = formatLocatorLabel(citation)
  return joinCitationLabelParts(sourceTitle, locationLabel)
}

export function formatCompactCitationLabel(citation: InkwiseCitation): string {
  const sourceTitle = formatCitationSourceTitle(citation, { maxLength: 22 })
  const locationLabel = formatLocatorLabel(citation)
  return joinCitationLabelParts(sourceTitle, locationLabel)
}

function joinCitationLabelParts(sourceTitle: string, locationLabel: string): string {
  const normalizedLocation = locationLabel === 'evidence' ? '' : locationLabel
  return [sourceTitle, normalizedLocation].filter(Boolean).join(' ')
}

function formatCitationSourceTitle(citation: InkwiseCitation, { maxLength }: { maxLength: number }): string {
  const rawTitle = citation.source_title || citation.segment_title || (citation.locator_json?.kind === 'web_snapshot' ? 'Web snapshot' : 'Evidence')
  const normalized = rawTitle.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`
}

export function formatLocatorLabel(citation: InkwiseCitation): string {
  const locator = citation.locator_json || {}
  const locatorKind = typeof locator.kind === 'string' ? locator.kind : null
  const pageNumbers = normalizedPageNumbers(locator.page_numbers)
  if (pageNumbers.length) {
    return `${pageNumbers.length > 1 ? 'pp.' : 'p.'}${formatPageNumbers(pageNumbers)}`
  }
  const rawPageStart = citation.page_number ?? locator.page_start ?? null
  const pageStart = typeof rawPageStart === 'number' && rawPageStart > 0 ? rawPageStart : null
  const pageEnd = locator.page_end ?? null
  if (typeof pageStart === 'number') {
    return typeof pageEnd === 'number' && pageEnd !== pageStart ? `pp.${pageStart}-${pageEnd}` : `p.${pageStart}`
  }
  if (locatorKind === 'time_range') {
    const timeLabel = formatTimeRangeLocator(locator)
    if (timeLabel) return timeLabel
  }
  if (locatorKind === 'image_asset') return 'image'
  if (locatorKind === 'audio_asset') return 'audio'
  if (locatorKind === 'video_asset') return 'video'
  if (citation.segment_title) return citation.segment_title
  if (locator.kind === 'web_snapshot') return 'web snapshot'
  return 'evidence'
}

function getPreviewKind(citation: InkwiseCitation | null, source: InkwiseSource | null): 'pdf' | 'image' | 'audio' | 'video' | 'other' {
  const contentType = (source?.content_type || '').toLowerCase()
  if (contentType === 'application/pdf') return 'pdf'
  if (contentType === 'image/jpeg' || contentType === 'image/png') return 'image'
  if (contentType === 'audio/mp3' || contentType === 'audio/wav') return 'audio'
  if (contentType === 'video/mp4' || contentType === 'video/mpeg') return 'video'

  const previewObject = (citation?.preview_object || '').toLowerCase()
  if (previewObject.endsWith('.pdf')) return 'pdf'
  if (previewObject.endsWith('.jpg') || previewObject.endsWith('.jpeg') || previewObject.endsWith('.png')) return 'image'
  if (previewObject.endsWith('.mp3') || previewObject.endsWith('.wav')) return 'audio'
  if (previewObject.endsWith('.mp4') || previewObject.endsWith('.mpeg') || previewObject.endsWith('.mpg')) return 'video'

  const locatorKind = citation?.locator_json?.kind
  if (locatorKind === 'page_range') return 'pdf'
  if (locatorKind === 'image_asset') return 'image'
  if (locatorKind === 'audio_asset') return 'audio'
  if (locatorKind === 'video_asset') return 'video'
  if (locatorKind === 'time_range') {
    const sourceKind = citation?.locator_json?.source_kind
    if (sourceKind === 'audio') return 'audio'
    if (sourceKind === 'video') return 'video'
  }
  return 'other'
}

function buildCitationPreviewUrl(url: string | null, citation: InkwiseCitation | null, source: InkwiseSource | null): string | null {
  const normalizedUrl = (url || '').trim()
  if (!normalizedUrl) return null
  if (!shouldUseCanonicalPdfPageFragment(citation, source)) return normalizedUrl
  const pageNumber = pageNumberForPreview(citation)
  if (!pageNumber) return normalizedUrl
  const [baseUrl, existingHash = ''] = normalizedUrl.split('#', 2)
  const hashParts = existingHash
    .split('&')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.startsWith('page=') && !part.startsWith('search='))
  const searchTerm = highlightSearchTerm(citation)
  if (searchTerm) hashParts.push(`search=${encodeURIComponent(searchTerm)}`)
  hashParts.unshift(`page=${pageNumber}`)
  return `${baseUrl}#${hashParts.join('&')}`
}

function highlightSearchTerm(citation: InkwiseCitation | null): string | null {
  const excerpt = citation?.excerpt || ''
  const first = normalizedExcerptHighlights(citation)[0]
  if (!first) return null
  const term = excerpt
    .slice(first.start, first.end)
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 6)
    .join(' ')
  return term || null
}

function shouldUseCanonicalPdfPageFragment(citation: InkwiseCitation | null, source: InkwiseSource | null): boolean {
  if (!citation) return false
  const previewKind = getPreviewKind(citation, source)
  if (previewKind !== 'pdf') return false
  const previewObject = String(citation.preview_object || '').toLowerCase()
  if (!previewObject) return true
  return !previewObject.includes('/segments/')
}

function pageNumberForPreview(citation: InkwiseCitation | null): number | null {
  if (!citation) return null
  const locator = citation.locator_json || {}
  const pageNumbers = normalizedPageNumbers(locator.page_numbers)
  if (pageNumbers.length) return pageNumbers[0]
  const pageStart = integerOrNull(locator.page_start)
  if (pageStart) return pageStart
  const pageNumber = integerOrNull(citation.page_number)
  if (pageNumber) return pageNumber
  return integerOrNull(locator.page_end)
}

function integerOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : null
}

function normalizedPageNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map(integerOrNull).filter((item): item is number => item !== null))).sort((a, b) => a - b)
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

function formatTimeRangeLocator(locator: Record<string, any>): string | null {
  const startMs = typeof locator.time_start_ms === 'number' ? locator.time_start_ms : null
  const endMs = typeof locator.time_end_ms === 'number' ? locator.time_end_ms : null
  if (startMs === null || endMs === null) return null
  return `${formatTimestamp(startMs)}-${formatTimestamp(endMs)}`
}

function formatTimestamp(valueMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(valueMs / 1000))
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)
  if (hours > 0) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
