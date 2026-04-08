'use client'

import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileUp, FolderPlus, Globe, Loader2 } from 'lucide-react'

import { GoogleDrivePicker } from '@/components/integrations/GoogleDrivePicker'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { apiClient, type InkwiseSource } from '@/lib/api'

type InkwiseSourceImportPanelProps = {
  title?: string
  description?: string
  onImported?: (sources: InkwiseSource[]) => Promise<void> | void
  compact?: boolean
}

export function InkwiseSourceImportPanel({
  title = 'Add References',
  description = 'Upload files, folders, ZIP archives, webpages, or selected Google Drive files.',
  onImported,
  compact = false,
}: InkwiseSourceImportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [webpageUrl, setWebpageUrl] = useState('')

  const refreshSources = async () => {
    await queryClient.invalidateQueries({ queryKey: ['inkwise', 'sources'] })
    await queryClient.invalidateQueries({ queryKey: ['inkwise', 'source-ingestions'] })
  }

  const finalizeImportedSources = async (sources: InkwiseSource[], successDescription: string) => {
    const uniqueSources = dedupeSourcesById(sources)
    for (const source of uniqueSources) {
      await apiClient.ingestInkwiseSource(source.id)
    }
    await refreshSources()
    if (onImported) {
      await onImported(uniqueSources)
    }
    toast({ title: 'Import started', description: successDescription })
  }

  const uploadLocalItems = useMutation({
    mutationFn: async (files: File[]) => {
      const supportedFiles = files.filter(isSupportedSourceFile)
      if (!supportedFiles.length) {
        throw new Error('No supported PDF, DOCX, or ZIP files were selected')
      }
      const imported: InkwiseSource[] = []
      for (const file of supportedFiles) {
        const init = await apiClient.initInkwiseSourceUpload({
          original_filename: file.name,
          original_path: getRelativePath(file),
          content_type: inferSourceContentType(file),
          size_bytes: file.size,
        })

        const response = await fetch(init.upload.url, {
          method: 'PUT',
          headers: init.upload.headers,
          body: file,
        })
        if (!response.ok) throw new Error(`Upload failed for ${file.name} (${response.status})`)

        const completed = await apiClient.completeInkwiseSourceUpload(init.source.id)
        imported.push(...completed.sources)
      }
      return imported
    },
    onSuccess: async (sources) => {
      await finalizeImportedSources(
        sources,
        `Queued ${sources.length} reference${sources.length === 1 ? '' : 's'} for ingestion.`
      )
    },
    onError: (error: Error) => {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' })
    },
  })

  const captureWebpage = useMutation({
    mutationFn: async (sourceUrl: string) => {
      const source = await apiClient.captureInkwiseWebpage({ source_url: sourceUrl })
      return [source]
    },
    onSuccess: async (sources) => {
      setWebpageUrl('')
      await finalizeImportedSources(sources, 'The webpage snapshot was stored and queued for ingestion.')
    },
    onError: (error: Error) => {
      toast({ title: 'Could not capture webpage', description: error.message, variant: 'destructive' })
    },
  })

  const importDriveFiles = useMutation({
    mutationFn: async (fileIds: string[]) => {
      const result = await apiClient.importInkwiseDriveSources(fileIds)
      return result.sources
    },
    onSuccess: async (sources) => {
      await finalizeImportedSources(
        sources,
        `Queued ${sources.length} imported reference${sources.length === 1 ? '' : 's'} for ingestion.`
      )
    },
    onError: (error: Error) => {
      toast({ title: 'Drive import failed', description: error.message, variant: 'destructive' })
    },
  })

  const isBusy = uploadLocalItems.isPending || captureWebpage.isPending || importDriveFiles.isPending

  return (
    <Card>
      <CardHeader className={compact ? 'pb-3' : undefined}>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className={compact ? 'space-y-4' : 'space-y-5'}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/zip,application/x-zip-compressed,.pdf,.docx,.zip"
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            event.target.value = ''
            if (files.length) uploadLocalItems.mutate(files)
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          {...({ webkitdirectory: '' } as any)}
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            event.target.value = ''
            if (files.length) uploadLocalItems.mutate(files)
          }}
        />

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => fileInputRef.current?.click()} disabled={isBusy}>
            {uploadLocalItems.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
            Add Files
          </Button>
          <Button variant="outline" onClick={() => folderInputRef.current?.click()} disabled={isBusy}>
            <FolderPlus className="mr-2 h-4 w-4" />
            Add Folder
          </Button>
        </div>

        <div className="flex flex-col gap-2 md:flex-row">
          <Input
            value={webpageUrl}
            onChange={(event) => setWebpageUrl(event.target.value)}
            placeholder="example.com/reference"
          />
          <Button
            variant="outline"
            onClick={() => captureWebpage.mutate(normalizeWebpageUrlInput(webpageUrl))}
            disabled={captureWebpage.isPending || !webpageUrl.trim() || isBusy}
          >
            {captureWebpage.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe className="mr-2 h-4 w-4" />}
            Capture Webpage
          </Button>
        </div>

        <GoogleDrivePicker
          onFilesSelected={(files) => {
            const fileIds = files.map((file) => file.id)
            if (fileIds.length) importDriveFiles.mutate(fileIds)
          }}
          multiSelect
          mimeTypes={[
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/zip',
            'application/x-zip-compressed',
          ]}
        />
      </CardContent>
    </Card>
  )
}

function dedupeSourcesById(sources: InkwiseSource[]): InkwiseSource[] {
  const seen = new Set<string>()
  const unique: InkwiseSource[] = []
  for (const source of sources) {
    if (seen.has(source.id)) continue
    seen.add(source.id)
    unique.push(source)
  }
  return unique
}

function normalizeWebpageUrlInput(value: string): string {
  const cleanValue = value.trim()
  if (!cleanValue) return ''
  return cleanValue.includes('://') ? cleanValue : `https://${cleanValue.replace(/^\/+/, '')}`
}

function inferSourceContentType(file: File): string {
  const explicit = (file.type || '').trim().toLowerCase()
  if (explicit) return explicit
  const filename = file.name.toLowerCase()
  if (filename.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (filename.endsWith('.zip')) return 'application/zip'
  if (filename.endsWith('.pdf')) return 'application/pdf'
  return 'application/octet-stream'
}

function getRelativePath(file: File): string {
  const withRelativePath = file as File & { webkitRelativePath?: string }
  return withRelativePath.webkitRelativePath?.trim() || file.name
}

function isSupportedSourceFile(file: File): boolean {
  const filename = file.name.toLowerCase()
  return filename.endsWith('.pdf') || filename.endsWith('.docx') || filename.endsWith('.zip')
}
