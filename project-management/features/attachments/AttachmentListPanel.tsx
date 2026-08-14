'use client'

/**
 * Shared attachment list + link form + cloud drive menu.
 */
import { useEffect, useRef, useState } from 'react'
import { Cloud, Link2 } from 'lucide-react'
import { Dropzone } from '@/components/ui/dropzone'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Attachment } from '../../types'
import type { CloudDriveFile, CloudDriveProvider } from '../../lib/cloudDrive'
import { AttachmentChip } from './AttachmentChip'
import { AttachmentPreviewModal } from './AttachmentPreviewModal'
import { ConnectDriveModal } from './ConnectDriveModal'
import { isImageAttachment } from './attachmentUtils'

type ScopeApi = {
  attachments: Attachment[]
  uploadError: string | null
  uploadFiles: (files: File[]) => Promise<void>
  addLink: (url: string, label?: string) => Promise<void>
  connectCloudDrive: (provider: CloudDriveProvider) => Promise<void>
  removeOne: (attachment: Attachment) => Promise<void>
  renameOne: (attachment: Attachment) => Promise<void>
  downloadOne: (attachment: Attachment) => Promise<void>
  previewId: string | null
  setPreviewId: (id: string | null) => void
  previewAttachment: Attachment | null
  previewUrl?: string | null
  driveProvider: CloudDriveProvider | null
  setDriveProvider: (p: CloudDriveProvider | null) => void
  driveMessage?: string
  driveFiles: CloudDriveFile[]
  driveLoading: boolean
  importDriveFiles: (fileIds: string[]) => Promise<void>
  maxMb: number
  cloudProviders: readonly CloudDriveProvider[]
  cloudLabel: (provider: CloudDriveProvider) => string
  coverAttachmentId?: string
  setCoverAttachment?: (attachment: Attachment) => Promise<void>
}

type Props = {
  scope: ScopeApi
  compact?: boolean
  showDropzone?: boolean
  /** Show the "Add from link" control (default true). */
  allowLink?: boolean
  /** Show the "Cloud drive" control (default true). */
  allowCloudDrive?: boolean
}

/** Renders chips, dropzone, link form, and preview modal for an attachment scope. */
export function AttachmentListPanel({
  scope,
  compact,
  showDropzone = true,
  allowLink = true,
  allowCloudDrive = true,
}: Props) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkName, setLinkName] = useState('')
  const preview = scope.previewAttachment
  const uploadFiles = scope.uploadFiles
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onPaste = (event: ClipboardEvent) => {
      const files = event.clipboardData?.files
      if (!files?.length) return
      event.preventDefault()
      void uploadFiles(Array.from(files))
    }
    root.addEventListener('paste', onPaste)
    return () => root.removeEventListener('paste', onPaste)
  }, [uploadFiles])

  return (
    <div ref={rootRef} tabIndex={-1} className={compact ? 'space-y-2 outline-none' : 'mt-4 outline-none'}>
      {!compact && (allowLink || allowCloudDrive) ? (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--foreground-muted))' }}>
            Attachments
          </p>
          <div className="flex flex-wrap gap-2">
            {allowLink ? (
              <button type="button" className="text-xs" style={{ color: 'hsl(var(--primary))' }} onClick={() => setLinkOpen((v) => !v)}>
                <Link2 className="mr-1 inline h-3 w-3" /> Add from link
              </button>
            ) : null}
            {allowCloudDrive && scope.cloudProviders.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="text-xs" style={{ color: 'hsl(var(--primary))' }}>
                    <Cloud className="mr-1 inline h-3 w-3" /> Cloud drive
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {scope.cloudProviders.map((provider) => (
                    <DropdownMenuItem key={provider} onClick={() => void scope.connectCloudDrive(provider)}>
                      {scope.cloudLabel(provider)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      ) : null}
      {allowLink && linkOpen ? (
        <div className="mb-2 flex flex-wrap gap-2">
          <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" className="tl-input h-8 flex-1 text-sm" />
          <Input value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="Label (optional)" className="tl-input h-8 w-36 text-sm" />
          <Button
            size="sm"
            className="tl-btn-primary h-8 border-0"
            disabled={!linkUrl.trim()}
            onClick={() => {
              void scope.addLink(linkUrl, linkName)
              setLinkUrl('')
              setLinkName('')
              setLinkOpen(false)
            }}
          >
            Add
          </Button>
        </div>
      ) : null}
      {showDropzone ? (
        <Dropzone
          onFiles={(files) => void scope.uploadFiles(files)}
          title={`Drop files here (max ${scope.maxMb} MB)`}
          description="Drag and drop or click to choose files."
          className="[&>div]:py-6"
        />
      ) : null}
      {scope.uploadError ? (
        <p className="mt-2 text-xs" style={{ color: 'hsl(var(--destructive))' }}>
          {scope.uploadError}
        </p>
      ) : null}
      <ul className={`space-y-1 ${showDropzone || scope.attachments.length ? 'mt-2' : ''}`}>
        {scope.attachments.map((attachment) => (
          <li key={attachment.id}>
            <AttachmentChip
              attachment={attachment}
              compact={compact}
              previewUrl={
                attachment.id === preview?.id && scope.previewUrl && isImageAttachment(attachment)
                  ? scope.previewUrl
                  : attachment.dataUrl && isImageAttachment(attachment)
                    ? attachment.dataUrl
                    : undefined
              }
              onPreview={() => scope.setPreviewId(attachment.id)}
              onDownload={() => void scope.downloadOne(attachment)}
              onRename={() => void scope.renameOne(attachment)}
              onDelete={() => void scope.removeOne(attachment)}
              isCover={scope.coverAttachmentId === attachment.id}
              onSetCover={scope.setCoverAttachment ? () => void scope.setCoverAttachment?.(attachment) : undefined}
            />
          </li>
        ))}
      </ul>
      <AttachmentPreviewModal
        attachment={preview}
        url={scope.previewUrl ?? preview?.dataUrl ?? null}
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) scope.setPreviewId(null)
        }}
      />
      <ConnectDriveModal
        provider={scope.driveProvider}
        message={scope.driveMessage}
        files={scope.driveFiles}
        loading={scope.driveLoading}
        onImport={scope.importDriveFiles}
        open={Boolean(scope.driveProvider)}
        onOpenChange={(open) => {
          if (!open) scope.setDriveProvider(null)
        }}
      />
    </div>
  )
}
