'use client'

import { useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, FileUp, Loader2, RefreshCw, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { useInkwiseSources } from '@/hooks/useInkwise'
import { apiClient } from '@/lib/api'

export default function InkwiseReferencesPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const sources = useInkwiseSources(1, 50)

  const refreshSources = async () => {
    await queryClient.invalidateQueries({ queryKey: ['inkwise', 'sources'] })
  }

  const uploadSource = useMutation({
    mutationFn: async (file: File) => {
      const init = await apiClient.initInkwiseSourceUpload({
        original_filename: file.name,
        content_type: file.type || 'application/pdf',
        size_bytes: file.size,
      })

      const response = await fetch(init.upload.url, {
        method: 'PUT',
        headers: init.upload.headers,
        body: file,
      })
      if (!response.ok) throw new Error(`Upload failed (${response.status})`)

      await apiClient.completeInkwiseSourceUpload(init.source.id)
      await apiClient.ingestInkwiseSource(init.source.id)
      return init.source.id
    },
    onSuccess: async () => {
      await refreshSources()
      toast({ title: 'Upload started', description: 'Your PDF was uploaded and queued for ingestion.' })
    },
    onError: (error: Error) => {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' })
    },
  })

  const previewSource = useMutation({
    mutationFn: async (sourceId: string) => {
      const result = await apiClient.previewInkwiseSource(sourceId)
      window.open(result.url, '_blank', 'noopener,noreferrer')
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
      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Source Library</CardTitle>
            <CardDescription>
              Upload PDFs, preview them, and trigger ingestion into retrieval segments and embeddings.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) uploadSource.mutate(file)
              }}
            />
            <Button variant="outline" onClick={() => refreshSources()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploadSource.isPending}>
              {uploadSource.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
              Upload PDF
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4">
        {sources.isLoading ? (
          <Card>
            <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading sources...
            </CardContent>
          </Card>
        ) : sources.data?.items.length ? (
          sources.data.items.map((source) => (
            <Card key={source.id}>
              <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-slate-900">{source.title}</h2>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                      {source.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">
                    {source.original_filename || source.content_type} • {Math.max(1, Math.round(source.size_bytes / 1024))} KB
                  </p>
                  <p className="text-xs text-slate-400">Updated {new Date(source.updated_at).toLocaleString()}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => previewSource.mutate(source.id)}>
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
          ))
        ) : (
          <Card>
            <CardContent className="p-10 text-center text-sm text-slate-500">
              No sources yet. Upload a PDF to start building your grounded source library.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
