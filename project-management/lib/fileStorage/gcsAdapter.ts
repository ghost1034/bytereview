/**
 * Google Cloud Storage file storage adapter.
 *
 * Wires Tasklytic attachments to the SAME private GCS bucket + service account
 * used by the Document Analysis module, via the backend broker routes at
 * `/api/tasklytic/files:*`. The browser uploads bytes directly to GCS through a
 * short-lived signed PUT url (3-step initiate -> PUT -> complete), and reads via
 * short-lived signed GET urls — so large files never round-trip through
 * localStorage or the Next.js server.
 *
 * Attachment records store the GCS object name in `storageRef` (storage =
 * 'object_store'); no `dataUrl` is persisted for uploaded files.
 */
import { tasklyticApiJson } from '../tasklyticApi'
import { useUiStore } from '../../stores/auth'
import { buildZipBlob } from './zipClient'
import { validateUploadMime } from './mimeValidation'
import type {
  AttachmentUrlSource,
  FileStorageAdapter,
  FileUploadInput,
  FileUploadResult,
} from './types'

const MAX_BYTES = 100 * 1024 * 1024

type InitiateResponse = { object_name: string; upload_url: string; content_type: string }

function inferContentType(file: File): string {
  if (file.type) return file.type
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) return 'application/pdf'
  if (name.endsWith('.docx'))
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (name.endsWith('.xlsx'))
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (name.endsWith('.pptx'))
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  if (name.endsWith('.csv')) return 'text/csv'
  if (name.endsWith('.zip')) return 'application/zip'
  return 'application/octet-stream'
}

async function signedDownloadUrl(objectName: string, downloadName?: string): Promise<string> {
  const params = new URLSearchParams({ object_name: objectName })
  if (downloadName) {
    params.set('download', 'true')
    params.set('filename', downloadName)
  }
  const { url } = await tasklyticApiJson<{ url: string }>(`/files:download-url?${params.toString()}`)
  return url
}

export const gcsFileStorageAdapter: FileStorageAdapter = {
  capabilities: {
    maxFileSize: MAX_BYTES,
    supportsThumbnailing: false,
    supportsVirusScan: false,
    supportsServerSideZip: false,
  },

  async upload(input: FileUploadInput): Promise<FileUploadResult> {
    const rejected = validateUploadMime(input.file)
    if (rejected) throw new Error(rejected)
    if (input.file.size > MAX_BYTES) {
      throw new Error(`File exceeds ${MAX_BYTES / (1024 * 1024)} MB limit`)
    }

    const contentType = inferContentType(input.file)
    const workspaceId = input.workspaceId ?? useUiStore.getState().activeWorkspaceId ?? undefined
    const initiated = await tasklyticApiJson<InitiateResponse>('/files:initiate', {
      method: 'POST',
      body: JSON.stringify({
        filename: input.file.name,
        content_type: contentType,
        size: input.file.size,
        workspace_id: workspaceId,
        scope: input.scope,
        scope_id: input.scopeId,
      }),
    })

    const putRes = await fetch(initiated.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': initiated.content_type },
      body: input.file,
    })
    if (!putRes.ok) {
      throw new Error(`Upload to storage failed (${putRes.status})`)
    }

    await tasklyticApiJson('/files:complete', {
      method: 'POST',
      body: JSON.stringify({ object_name: initiated.object_name }),
    })

    return {
      ref: initiated.object_name,
      storage: 'object_store',
      mime: contentType,
      size: input.file.size,
      name: input.file.name,
    }
  },

  async getUrl(attachment: AttachmentUrlSource): Promise<string> {
    // Links and cloud-drive entries carry their URL inline.
    if (attachment.storage !== 'object_store' && attachment.dataUrl) return attachment.dataUrl
    if (attachment.mime === 'link/url') return attachment.dataUrl ?? ''
    if (attachment.storageRef) return signedDownloadUrl(attachment.storageRef)
    if (attachment.dataUrl) return attachment.dataUrl
    throw new Error('File not found')
  },

  async remove(ref: string): Promise<void> {
    const params = new URLSearchParams({ object_name: ref })
    await tasklyticApiJson(`/files?${params.toString()}`, { method: 'DELETE' })
  },

  async zipMany(refs: string[], names?: string[]): Promise<Blob> {
    const entries = await Promise.all(
      refs.map(async (ref, index) => {
        const url = await signedDownloadUrl(ref)
        const res = await fetch(url)
        if (!res.ok) throw new Error('One or more files could not be downloaded')
        return { name: names?.[index] ?? `file-${index + 1}`, data: await res.blob() }
      }),
    )
    return buildZipBlob(entries)
  },
}
