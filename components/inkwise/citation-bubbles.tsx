'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, FileText, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { apiClient, InkwiseCitation, InkwiseSource } from '@/lib/api'

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
  }, [open, selected?.source_id])

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
                  <Button size="sm" variant="outline" onClick={() => setSelectedIndex((value) => Math.max(0, value - 1))} disabled={selectedIndex === 0}>
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Prev
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSelectedIndex((value) => Math.min(items.length - 1, value + 1))} disabled={selectedIndex >= items.length - 1}>
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" />
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
                  <div className="rounded-2xl border bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence</div>
                    <div className="mt-2 text-sm text-slate-700">{selected.excerpt || 'No excerpt available.'}</div>
                  </div>

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
                        {previewUrl ? (
                          <Button size="sm" variant="outline" onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}>
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
                    ) : previewUrl ? (
                      <iframe
                        title={`Evidence preview ${selected.evidence_id || selectedIndex + 1}`}
                        src={previewUrl}
                        className="h-[28rem] w-full rounded-xl border bg-white"
                      />
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
  const rawPageStart = citation.page_number ?? locator.page_start ?? null
  const pageStart = typeof rawPageStart === 'number' && rawPageStart > 0 ? rawPageStart : null
  const pageEnd = locator.page_end ?? null
  if (typeof pageStart === 'number') {
    return typeof pageEnd === 'number' && pageEnd !== pageStart ? `pp.${pageStart}-${pageEnd}` : `p.${pageStart}`
  }
  if (citation.segment_title) return citation.segment_title
  if (locator.kind === 'web_snapshot') return 'web snapshot'
  return 'evidence'
}
