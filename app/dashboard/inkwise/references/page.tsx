'use client'

import { useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, Loader2, RefreshCw, Trash2 } from 'lucide-react'

import { InkwiseSourceImportPanel } from '@/components/inkwise/source-import-panel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { useInkwiseSourceIngestions, useInkwiseSources } from '@/hooks/useInkwise'
import { apiClient, InkwiseSource, InkwiseSourceIngestion } from '@/lib/api'
import { INKWISE_SOURCE_POLL_INTERVAL_MS, isInkwiseIngestionActiveStatus, isInkwiseSourceActiveStatus } from '@/lib/inkwise-source-status'

export default function InkwiseReferencesPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const sources = useInkwiseSources(1, 50, {
    refetchInterval: (query) => {
      const data = query.state.data as { items?: Array<{ status?: string | null }> } | undefined
      return data?.items?.some((source) => isInkwiseSourceActiveStatus(source.status)) ? INKWISE_SOURCE_POLL_INTERVAL_MS : false
    },
    refetchOnWindowFocus: true,
  })
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

  const refreshSources = async () => {
    await queryClient.invalidateQueries({ queryKey: ['inkwise', 'sources'] })
    await queryClient.invalidateQueries({ queryKey: ['inkwise', 'source-ingestions'] })
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
      if (isDocxSource(source)) {
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

  return (
    <div className="space-y-6">
      <InkwiseSourceImportPanel
        title="References"
        description="Build the reference library that powers document grounding, citation bubbles, grounded chat, and predictive writing."
      />

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
        {sources.isLoading ? (
          <Card>
            <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading sources...
            </CardContent>
          </Card>
        ) : sources.data?.items.length ? (
          sources.data.items.map((source) => {
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
                      {typeof latestIngestion?.page_count === 'number' ? (
                        <>
                          <span>•</span>
                          <span>{formatReferencePageCount(latestIngestion.page_count)}</span>
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
              No sources yet. Upload a document, image, audio file, video, or capture a webpage to start building your grounded source library.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function isDocxSource(source: InkwiseSource): boolean {
  return (source.content_type || '').toLowerCase() === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

function sourceTypeLabel(type: string, contentType: string): string {
  if (type === 'webpage') return 'webpage'
  if (contentType === 'application/zip') return 'zip'
  if (contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx'
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

function formatReferencePageCount(pageCount: number): string {
  return `${pageCount.toLocaleString()} ${pageCount === 1 ? 'page' : 'pages'} processed`
}
