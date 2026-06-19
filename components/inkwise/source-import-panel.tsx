'use client'

import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileUp, FolderPlus, Globe, Loader2 } from 'lucide-react'

import { GoogleDrivePicker } from '@/components/integrations/GoogleDrivePicker'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useBillingAccount } from '@/hooks/useBilling'
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
  description = 'Upload documents, images, audio, video, folders, ZIP archives, webpages, or selected Google Drive files.',
  onImported,
  compact = false,
}: InkwiseSourceImportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data: billingAccount } = useBillingAccount()
  const [webpageUrl, setWebpageUrl] = useState('')
  const allowRichMedia = billingAccount?.plan_code === 'pro'

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
      if (!allowRichMedia && files.some(isAudioOrVideoSourceFile)) {
        throw new Error('Audio and video references require the Pro plan.')
      }
      const supportedFiles = files.filter((file) => isSupportedSourceFile(file, allowRichMedia))
      if (!supportedFiles.length) {
        throw new Error(
          allowRichMedia
            ? 'No supported document, image, audio, video, or ZIP files were selected'
            : 'No supported document, image, or ZIP files were selected'
        )
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
        <CardHeader className={compact ? 'p-4' : undefined}>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
          {!allowRichMedia ? (
            <p className="text-sm text-slate-500">Audio and video references require the Pro plan.</p>
          ) : null}
        </CardHeader>
      <CardContent className={compact ? 'space-y-4' : 'space-y-5'}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={buildAcceptedSourceTypes(allowRichMedia)}
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

        <div className="flex min-w-0 flex-col gap-2 md:flex-row">
          <Input
            value={webpageUrl}
            onChange={(event) => setWebpageUrl(event.target.value)}
            placeholder="example.com/reference"
            className="min-w-0 flex-1"
          />
          <Button
            variant="outline"
            className="shrink-0"
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
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/zip',
            'application/x-zip-compressed',
            'image/jpeg',
            'image/png',
            ...(allowRichMedia
              ? ['audio/mp3', 'audio/mpeg', 'audio/wav', 'video/mp4', 'video/mpeg']
              : []),
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
  if (explicit === 'image/jpg') return 'image/jpeg'
  if (explicit === 'audio/mpeg') return 'audio/mp3'
  if (explicit === 'audio/x-wav' || explicit === 'audio/wave') return 'audio/wav'
  if (explicit === 'video/mpg') return 'video/mpeg'
  if (explicit) return explicit
  const filename = file.name.toLowerCase()
  if (filename.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (filename.endsWith('.pptx')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  if (filename.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (filename.endsWith('.zip')) return 'application/zip'
  if (filename.endsWith('.pdf')) return 'application/pdf'
  if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) return 'image/jpeg'
  if (filename.endsWith('.png')) return 'image/png'
  if (filename.endsWith('.mp3')) return 'audio/mp3'
  if (filename.endsWith('.wav')) return 'audio/wav'
  if (filename.endsWith('.mp4')) return 'video/mp4'
  if (filename.endsWith('.mpeg') || filename.endsWith('.mpg')) return 'video/mpeg'
  return 'application/octet-stream'
}

function getRelativePath(file: File): string {
  const withRelativePath = file as File & { webkitRelativePath?: string }
  return withRelativePath.webkitRelativePath?.trim() || file.name
}

function buildAcceptedSourceTypes(allowRichMedia: boolean): string {
  return [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/x-zip-compressed',
    'image/jpeg',
    'image/png',
    ...(allowRichMedia ? ['audio/mp3', 'audio/mpeg', 'audio/wav', 'video/mp4', 'video/mpeg'] : []),
    '.pdf',
    '.docx',
    '.pptx',
    '.xlsx',
    '.zip',
    '.jpg',
    '.jpeg',
    '.png',
    ...(allowRichMedia ? ['.mp3', '.wav', '.mp4', '.mpeg', '.mpg'] : []),
  ].join(',')
}

function isAudioOrVideoSourceFile(file: File): boolean {
  const filename = file.name.toLowerCase()
  return (
    filename.endsWith('.mp3') ||
    filename.endsWith('.wav') ||
    filename.endsWith('.mp4') ||
    filename.endsWith('.mpeg') ||
    filename.endsWith('.mpg')
  )
}

function isSupportedSourceFile(file: File, allowRichMedia: boolean): boolean {
  const filename = file.name.toLowerCase()
  return (
    filename.endsWith('.pdf') ||
    filename.endsWith('.docx') ||
    filename.endsWith('.pptx') ||
    filename.endsWith('.xlsx') ||
    filename.endsWith('.zip') ||
    filename.endsWith('.jpg') ||
    filename.endsWith('.jpeg') ||
    filename.endsWith('.png') ||
    (allowRichMedia && isAudioOrVideoSourceFile(file))
  )
}
