'use client'

/**
 * Single attachment chip with preview, download, rename, and delete actions.
 */
import {
  Download,
  ExternalLink,
  Eye,
  FileIcon,
  FileText,
  Film,
  ImageIcon,
  Link2,
  MoreHorizontal,
  Music,
  Pencil,
  Sheet,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Attachment } from '../../types'
import {
  formatFileSize,
  isImageAttachment,
  isLinkAttachment,
  mimeCategory,
} from './attachmentUtils'

type Props = {
  attachment: Attachment
  previewUrl?: string
  compact?: boolean
  onPreview: () => void
  onDownload: () => void
  onRename: () => void
  onDelete: () => void
}

function CategoryIcon({ attachment }: { attachment: Attachment }) {
  const cat = mimeCategory(attachment.mime)
  const cls = 'h-4 w-4 shrink-0'
  if (isImageAttachment(attachment)) return <ImageIcon className={cls} />
  if (isLinkAttachment(attachment)) return <Link2 className={cls} />
  if (cat === 'document') return <FileText className={cls} />
  if (cat === 'spreadsheet') return <Sheet className={cls} />
  if (cat === 'video') return <Film className={cls} />
  if (cat === 'audio') return <Music className={cls} />
  return <FileIcon className={cls} />
}

/** Compact attachment row used in task and comment composers. */
export function AttachmentChip({
  attachment,
  previewUrl,
  compact,
  onPreview,
  onDownload,
  onRename,
  onDelete,
}: Props) {
  const thumb = previewUrl && isImageAttachment(attachment)

  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${compact ? 'text-xs' : 'text-sm'}`}
      style={{ background: 'var(--bg-muted)' }}
    >
      {thumb ? (
        <button type="button" onClick={onPreview} className="shrink-0 overflow-hidden rounded">
          <img src={previewUrl} alt="" className="h-8 w-8 object-cover" />
        </button>
      ) : (
        <span style={{ color: 'var(--ink-muted)' }}>
          <CategoryIcon attachment={attachment} />
        </span>
      )}
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left"
        style={{ color: 'var(--ink-secondary)' }}
        onClick={onPreview}
      >
        {attachment.name}
      </button>
      {!compact ? (
        <span className="shrink-0 text-xs" style={{ color: 'var(--ink-faint)' }}>
          {formatFileSize(attachment.size)}
        </span>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Attachment actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="tl-popover-surface" align="end">
          <DropdownMenuItem onClick={onPreview}>
            <Eye className="mr-2 h-4 w-4" /> Preview
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDownload}>
            <Download className="mr-2 h-4 w-4" /> Download
          </DropdownMenuItem>
          {isLinkAttachment(attachment) && attachment.dataUrl ? (
            <DropdownMenuItem asChild>
              <a href={attachment.dataUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" /> Open link
              </a>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={onRename}>
            <Pencil className="mr-2 h-4 w-4" /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
