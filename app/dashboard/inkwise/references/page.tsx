'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpenText, Eye, Loader2, RefreshCw, Trash2 } from 'lucide-react'

import { InkwiseSourceImportPanel } from '@/components/inkwise/source-import-panel'
import { InkwiseSourceListLoadMore } from '@/components/inkwise/source-list-load-more'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { useInkwiseSourceIngestions, useInkwiseSources } from '@/hooks/useInkwise'
import { apiClient, InkwiseBibliographicMetadata, InkwiseSource, InkwiseSourceIngestion } from '@/lib/api'
import { INKWISE_SOURCE_POLL_INTERVAL_MS, isInkwiseIngestionActiveStatus } from '@/lib/inkwise-source-status'
import { compareNaturalText } from '@/lib/utils'

export default function InkwiseReferencesPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [sourceSearch, setSourceSearch] = useState('')
  // Search filters client-side, so load the full library while a query is active.
  const sources = useInkwiseSources({ loadAll: Boolean(sourceSearch.trim()) })
  const ingestions = useInkwiseSourceIngestions(undefined, {
    refetchInterval: (query) => {
      const data = query.state.data as { ingestions?: Array<{ status?: string | null }> } | undefined
      return data?.ingestions?.some((ingestion) => isInkwiseIngestionActiveStatus(ingestion.status)) ? INKWISE_SOURCE_POLL_INTERVAL_MS : false
    },
    refetchOnWindowFocus: true,
  })
  const latestIngestionBySourceId = useMemo(() => {
    const latest = new Map<string, NonNullable<typeof ingestions.data>['ingestions'][number]>()
    for (const ingestion of ingestions.data?.ingestions ?? []) {
      if (!latest.has(ingestion.source_id)) {
        latest.set(ingestion.source_id, ingestion)
      }
    }
    return latest
  }, [ingestions.data])
  const [editingSource, setEditingSource] = useState<InkwiseSource | null>(null)
  const [metadataForm, setMetadataForm] = useState<MetadataFormState>(emptyMetadataForm())
  const filteredSources = useMemo(() => {
    const items = [...(sources.data?.items ?? [])]
    items.sort((left, right) => compareNaturalText(left.title, right.title))
    return items.filter((source) => matchesSourceSearch(source, sourceSearch))
  }, [sources.data?.items, sourceSearch])

  const refreshSources = async () => {
    await queryClient.invalidateQueries({ queryKey: ['inkwise', 'sources'] })
    await queryClient.invalidateQueries({ queryKey: ['inkwise', 'source-ingestions'] })
    await queryClient.invalidateQueries({ queryKey: ['inkwise', 'documents'] })
  }

  const previewSource = useMutation({
    mutationFn: async ({ source, latestIngestion }: { source: InkwiseSource; latestIngestion?: InkwiseSourceIngestion }) => {
      const canonicalBucket = (latestIngestion?.canonical_pdf_gcs_bucket || '').trim()
      const canonicalObject = (latestIngestion?.canonical_pdf_gcs_object || '').trim()
      if (canonicalBucket && canonicalObject) {
        const result = await apiClient.previewInkwiseSourceAsset(source.id, {
          bucket: canonicalBucket,
          object_name: canonicalObject,
          disposition_filename: source.original_filename || source.title,
        })
        window.open(result.url, '_blank', 'noopener,noreferrer')
        return
      }
      if (isOfficeSourceRequiringConversion(source)) {
        throw new Error('PDF preview will be available after ingestion completes.')
      }
      const result = await apiClient.previewInkwiseSource(source.id)
      window.open(result.url, '_blank', 'noopener,noreferrer')
    },
    onError: (error: Error) => {
      toast({ title: 'Could not preview source', description: error.message, variant: 'destructive' })
    },
  })

  const ingestSource = useMutation({
    mutationFn: (sourceId: string) => apiClient.ingestInkwiseSource(sourceId),
    onSuccess: async () => {
      await refreshSources()
      toast({ title: 'Re-ingestion queued', description: 'Inkwise will rebuild retrieval segments and embeddings for this source.' })
    },
    onError: (error: Error) => {
      toast({ title: 'Could not re-ingest source', description: error.message, variant: 'destructive' })
    },
  })

  const deleteSource = useMutation({
    mutationFn: (sourceId: string) => apiClient.deleteInkwiseSource(sourceId),
    onSuccess: async () => {
      await refreshSources()
      toast({ title: 'Source removed', description: 'The source was removed from your Inkwise library.' })
    },
    onError: (error: Error) => {
      toast({ title: 'Could not delete source', description: error.message, variant: 'destructive' })
    },
  })

  const updateSource = useMutation({
    mutationFn: async () => {
      if (!editingSource) throw new Error('No source selected')
      return apiClient.updateInkwiseSource(editingSource.id, {
        title: metadataForm.title.trim() || editingSource.title,
        bibliographic_metadata: buildBibliographicMetadata(metadataForm),
      })
    },
    onSuccess: async () => {
      await refreshSources()
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'document'] })
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'document-revisions'] })
      toast({ title: 'Metadata updated', description: 'Inkwise refreshed citations in linked documents that use this source.' })
      setEditingSource(null)
    },
    onError: (error: Error) => {
      toast({ title: 'Could not update source metadata', description: error.message, variant: 'destructive' })
    },
  })

  function openMetadataEditor(source: InkwiseSource) {
    setEditingSource(source)
    setMetadataForm(metadataFormFromSource(source))
  }

  return (
    <div className="space-y-6">
      <div data-tour="inkwise-import-panel">
        <InkwiseSourceImportPanel
          title="References"
          description="Build the reference library that powers document grounding, citation bubbles, grounded chat, and predictive writing."
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="space-y-2 p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">1. Add References</div>
            <div className="text-sm text-slate-700">Upload documents, images, audio, video, folders, or ZIPs, capture a webpage, or import selected files from Google Drive.</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">2. Wait For Ingestion</div>
            <div className="text-sm text-slate-700">Inkwise creates retrieval segments and embeddings so the reference can support grounded drafting.</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">3. Bind In Write</div>
            <div className="text-sm text-slate-700">Bind ready references from the Write sidebar so chat, inline tools, and grounded prediction can use them.</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4">
        <Card data-tour="inkwise-source-library">
          <CardHeader className="pb-3">
            <CardTitle>Source Library</CardTitle>
            <CardDescription>Search your loaded Inkwise references and scroll through the library without stretching the page.</CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              value={sourceSearch}
              onChange={(event) => setSourceSearch(event.target.value)}
              placeholder="Search references by title, path, URL, filename, or status"
            />
          </CardContent>
        </Card>

        {sources.isLoading ? (
          <Card>
            <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading sources...
            </CardContent>
          </Card>
        ) : sources.data?.items.length ? (
          <ScrollArea className="max-h-[calc(100vh-var(--header-height)-21rem)] rounded-3xl border bg-white p-1">
            <div className="space-y-4 p-3">
              {filteredSources.length ? (
                filteredSources.map((source) => {
                  const latestIngestion = latestIngestionBySourceId.get(source.id)

                  return (
                    <Card key={source.id}>
                      <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-semibold text-slate-900">{source.title}</h2>
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                              {sourceTypeLabel(source.type, source.content_type)}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                              {source.status}
                            </span>
                          </div>
                          <p className="text-sm text-slate-500">
                            {source.original_path || source.source_url || source.original_filename || source.content_type} • {Math.max(1, Math.round(source.size_bytes / 1024))} KB
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                            <span>Updated {new Date(source.updated_at).toLocaleString()}</span>
                            <span>•</span>
                            <span>{referenceStatusLabel(source.status)}</span>
                            {latestIngestion ? (
                              <>
                                <span>•</span>
                                <span>{formatReferenceUsage(latestIngestion)}</span>
                              </>
                            ) : null}
                          </div>
                          {source.failure_detail ? <p className="text-sm text-rose-600">{source.failure_detail}</p> : null}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" onClick={() => previewSource.mutate({ source, latestIngestion })}>
                            <Eye className="mr-2 h-4 w-4" />
                            Preview
                          </Button>
                          <Button variant="outline" onClick={() => ingestSource.mutate(source.id)}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Re-ingest
                          </Button>
                          <Button variant="outline" onClick={() => openMetadataEditor(source)}>
                            <BookOpenText className="mr-2 h-4 w-4" />
                            Metadata
                          </Button>
                          <Button variant="outline" onClick={() => deleteSource.mutate(source.id)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })
              ) : (
                <Card>
                  <CardContent className="p-10 text-center text-sm text-slate-500">
                    No references match that search.
                  </CardContent>
                </Card>
              )}
              <InkwiseSourceListLoadMore
                hasNextPage={sources.hasNextPage}
                isFetchingNextPage={sources.isFetchingNextPage}
                onLoadMore={() => sources.fetchNextPage()}
                loadedCount={sources.data?.items.length}
                totalCount={sources.data?.total}
              />
            </div>
          </ScrollArea>
        ) : (
          <Card>
            <CardContent className="p-10 text-center text-sm text-slate-500">
              No sources yet. Upload a document, image, audio file, video, or capture a webpage to start building your grounded source library.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={Boolean(editingSource)} onOpenChange={(open) => { if (!open) setEditingSource(null) }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Bibliographic Metadata</DialogTitle>
            <DialogDescription>
              Inkwise uses this metadata to generate academic-style inline citations, footnotes, and endnotes, and linked documents refresh automatically when you save.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="inkwise-source-title">Source title</Label>
              <Input id="inkwise-source-title" value={metadataForm.title} onChange={(event) => setMetadataForm((current) => ({ ...current, title: event.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="inkwise-citation-type">Citation type</Label>
              <Select value={metadataForm.citationType} onValueChange={(value) => setMetadataForm((current) => ({ ...current, citationType: value }))}>
                <SelectTrigger id="inkwise-citation-type">
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="other">Other</SelectItem>
                  <SelectItem value="book">Book</SelectItem>
                  <SelectItem value="article">Article</SelectItem>
                  <SelectItem value="case">Case</SelectItem>
                  <SelectItem value="statute">Statute</SelectItem>
                  <SelectItem value="webpage">Webpage</SelectItem>
                  <SelectItem value="report">Report</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="inkwise-year">Year</Label>
              <Input id="inkwise-year" value={metadataForm.year} onChange={(event) => setMetadataForm((current) => ({ ...current, year: event.target.value }))} placeholder="2024" />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="inkwise-authors">Authors</Label>
              <Textarea id="inkwise-authors" value={metadataForm.authors} onChange={(event) => setMetadataForm((current) => ({ ...current, authors: event.target.value }))} placeholder="One author per line" className="min-h-[96px]" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="inkwise-short-title">Short title</Label>
              <Input id="inkwise-short-title" value={metadataForm.shortTitle} onChange={(event) => setMetadataForm((current) => ({ ...current, shortTitle: event.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="inkwise-container-title">Container title</Label>
              <Input id="inkwise-container-title" value={metadataForm.containerTitle} onChange={(event) => setMetadataForm((current) => ({ ...current, containerTitle: event.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="inkwise-publisher">Publisher</Label>
              <Input id="inkwise-publisher" value={metadataForm.publisher} onChange={(event) => setMetadataForm((current) => ({ ...current, publisher: event.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="inkwise-url">URL</Label>
              <Input id="inkwise-url" value={metadataForm.url} onChange={(event) => setMetadataForm((current) => ({ ...current, url: event.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="inkwise-court">Court</Label>
              <Input id="inkwise-court" value={metadataForm.court} onChange={(event) => setMetadataForm((current) => ({ ...current, court: event.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="inkwise-reporter">Reporter</Label>
              <Input id="inkwise-reporter" value={metadataForm.reporter} onChange={(event) => setMetadataForm((current) => ({ ...current, reporter: event.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="inkwise-reporter-volume">Reporter volume</Label>
              <Input id="inkwise-reporter-volume" value={metadataForm.reporterVolume} onChange={(event) => setMetadataForm((current) => ({ ...current, reporterVolume: event.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="inkwise-first-page">First page</Label>
              <Input id="inkwise-first-page" value={metadataForm.firstPage} onChange={(event) => setMetadataForm((current) => ({ ...current, firstPage: event.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="inkwise-pin-cite">Pin cite</Label>
              <Input id="inkwise-pin-cite" value={metadataForm.pinCite} onChange={(event) => setMetadataForm((current) => ({ ...current, pinCite: event.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="inkwise-docket-number">Docket number</Label>
              <Input id="inkwise-docket-number" value={metadataForm.docketNumber} onChange={(event) => setMetadataForm((current) => ({ ...current, docketNumber: event.target.value }))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSource(null)}>Cancel</Button>
            <Button onClick={() => updateSource.mutate()} disabled={updateSource.isPending || !editingSource}>
              {updateSource.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save metadata
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type MetadataFormState = {
  title: string
  citationType: string
  authors: string
  shortTitle: string
  containerTitle: string
  publisher: string
  year: string
  url: string
  court: string
  reporter: string
  reporterVolume: string
  firstPage: string
  pinCite: string
  docketNumber: string
}

function emptyMetadataForm(): MetadataFormState {
  return {
    title: '',
    citationType: 'other',
    authors: '',
    shortTitle: '',
    containerTitle: '',
    publisher: '',
    year: '',
    url: '',
    court: '',
    reporter: '',
    reporterVolume: '',
    firstPage: '',
    pinCite: '',
    docketNumber: '',
  }
}

function metadataFormFromSource(source: InkwiseSource): MetadataFormState {
  const metadata = source.bibliographic_metadata || {}
  return {
    title: source.title || '',
    citationType: metadata.citation_type || 'other',
    authors: Array.isArray(metadata.authors) ? metadata.authors.join('\n') : '',
    shortTitle: metadata.short_title || '',
    containerTitle: metadata.container_title || '',
    publisher: metadata.publisher || '',
    year: metadata.year || '',
    url: metadata.url || source.source_url || '',
    court: metadata.court || '',
    reporter: metadata.reporter || '',
    reporterVolume: metadata.reporter_volume || '',
    firstPage: metadata.first_page || '',
    pinCite: metadata.pin_cite || '',
    docketNumber: metadata.docket_number || '',
  }
}

function buildBibliographicMetadata(form: MetadataFormState): InkwiseBibliographicMetadata {
  return {
    citation_type: form.citationType === 'other' ? 'other' : form.citationType as InkwiseBibliographicMetadata['citation_type'],
    authors: form.authors.split('\n').map((item) => item.trim()).filter(Boolean),
    short_title: form.shortTitle.trim() || null,
    container_title: form.containerTitle.trim() || null,
    publisher: form.publisher.trim() || null,
    year: form.year.trim() || null,
    url: form.url.trim() || null,
    court: form.court.trim() || null,
    reporter: form.reporter.trim() || null,
    reporter_volume: form.reporterVolume.trim() || null,
    first_page: form.firstPage.trim() || null,
    pin_cite: form.pinCite.trim() || null,
    docket_number: form.docketNumber.trim() || null,
  }
}

function isOfficeSourceRequiringConversion(source: InkwiseSource): boolean {
  const contentType = (source.content_type || '').toLowerCase()
  return (
    contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    contentType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
}

function sourceTypeLabel(type: string, contentType: string): string {
  if (type === 'webpage') return 'webpage'
  if (contentType === 'application/zip') return 'zip'
  if (contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx'
  if (contentType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx'
  if (contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx'
  if (contentType === 'application/pdf') return 'pdf'
  if (contentType === 'image/jpeg') return 'image'
  if (contentType === 'image/png') return 'image'
  if (contentType === 'audio/mp3') return 'audio'
  if (contentType === 'audio/wav') return 'audio'
  if (contentType === 'video/mp4') return 'video'
  if (contentType === 'video/mpeg') return 'video'
  return type || 'reference'
}

function referenceStatusLabel(status: string): string {
  if (status === 'completed') return 'Ready for binding'
  if (status === 'processing') return 'Preparing for grounding'
  if (status === 'queued') return 'Queued for ingestion'
  if (status === 'failed') return 'Needs attention'
  if (status === 'uploading') return 'Uploading'
  return status || 'Reference status'
}

function formatReferenceUsage(ingestion: InkwiseSourceIngestion): string {
  const usageTokens = typeof ingestion.usage_tokens === 'number' ? ingestion.usage_tokens : null
  const pageCount = typeof ingestion.page_count === 'number' ? ingestion.page_count : null

  if (usageTokens !== null && usageTokens > 0) {
    return `${usageTokens.toLocaleString()} provider tokens billed`
  }
  if (pageCount !== null) {
    return `${pageCount.toLocaleString()} ${pageCount === 1 ? 'page' : 'pages'} processed`
  }
  return 'Usage pending'
}

function matchesSourceSearch(source: InkwiseSource, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true

  return [
    source.title,
    source.original_path,
    source.source_url,
    source.original_filename,
    source.status,
    sourceTypeLabel(source.type, source.content_type),
  ]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(normalizedQuery))
}
