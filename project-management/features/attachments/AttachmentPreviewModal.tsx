'use client'

/**
 * Modal preview for attachment images, PDFs, and links.
 */
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { Attachment } from '../../types'
import { downloadNamedFile, isImageAttachment, isLinkAttachment, isPdfAttachment } from './attachmentUtils'

type Props = {
  attachment: Attachment | null
  url: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Inline preview dialog — images/PDFs embed; others offer download. */
export function AttachmentPreviewModal({ attachment, url, open, onOpenChange }: Props) {
  if (!attachment) return null
  const href = url ?? attachment.dataUrl ?? ''
  const isImage = isImageAttachment(attachment)
  const isPdf = isPdfAttachment(attachment)
  const isLink = isLinkAttachment(attachment)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="tl-dialog-surface max-h-[90vh] max-w-3xl overflow-auto">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{attachment.name}</DialogTitle>
        </DialogHeader>
        {isImage && href ? (
          <img src={href} alt={attachment.name} className="mx-auto max-h-[70vh] w-auto rounded-lg object-contain" />
        ) : null}
        {isPdf && href ? (
          <embed src={href} type="application/pdf" className="h-[70vh] w-full rounded-lg" />
        ) : null}
        {isLink && href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="break-all text-sm" style={{ color: 'var(--primary)' }}>
            {href}
          </a>
        ) : null}
        {!isImage && !isPdf && !isLink ? (
          <div className="space-y-3 py-6 text-center">
            <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
              No preview available for this file type.
            </p>
            {href ? (
              <Button
                className="tl-btn-primary border-0"
                onClick={() => downloadNamedFile(href, attachment.name)}
              >
                Download
              </Button>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
