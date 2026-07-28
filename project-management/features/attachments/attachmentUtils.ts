import type { Attachment } from '../../types'

export type MimeCategory = 'image' | 'document' | 'spreadsheet' | 'video' | 'audio' | 'link' | 'other'

/** Human-readable byte size. */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** True when the attachment mime is an image. */
export function isImageAttachment(att: Pick<Attachment, 'mime'>): boolean {
  return att.mime.startsWith('image/')
}

/** True when the attachment mime is PDF. */
export function isPdfAttachment(att: Pick<Attachment, 'mime'>): boolean {
  return att.mime === 'application/pdf'
}

/** True when the attachment represents an external URL. */
export function isLinkAttachment(att: Pick<Attachment, 'mime'>): boolean {
  return att.mime === 'link/url' || att.mime === 'text/uri-list'
}

/** Map mime to Files-tab category chips. */
export function mimeCategory(mime: string): MimeCategory {
  if (mime === 'link/url' || mime === 'text/uri-list') return 'link'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime === 'text/csv'
  ) {
    return 'spreadsheet'
  }
  if (
    mime.includes('pdf') ||
    mime.includes('word') ||
    mime.includes('document') ||
    mime.startsWith('text/')
  ) {
    return 'document'
  }
  return 'other'
}

export const MIME_CATEGORY_LABELS: Record<MimeCategory, string> = {
  image: 'Image',
  document: 'Document',
  spreadsheet: 'Spreadsheet',
  video: 'Video',
  audio: 'Audio',
  link: 'Link',
  other: 'Other',
}

/** Derive a friendly label from a URL attachment. */
export function labelFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return url.slice(0, 48)
  }
}

/** Trigger a browser download for a blob or URL. */
export function downloadNamedFile(url: string, name: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.rel = 'noopener noreferrer'
  anchor.target = '_blank'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
