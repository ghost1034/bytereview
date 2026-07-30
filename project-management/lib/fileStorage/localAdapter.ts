/**
 * V1 file storage — inline data URLs capped at 100 MB with MIME validation.
 */
import { newId } from '../ids'
import { validateUploadMime } from './mimeValidation'
import { buildZipBlob } from './zipClient'
import type {
  AttachmentUrlSource,
  FileStorageAdapter,
  FileUploadInput,
  FileUploadResult,
} from './types'

const MAX_BYTES = 100 * 1024 * 1024
const refs = new Map<string, { dataUrl: string; name: string }>()

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, body] = dataUrl.split(',')
  const mime = header.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream'
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export const localFileStorageAdapter: FileStorageAdapter = {
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
    const dataUrl = await readDataUrl(input.file)
    const ref = newId()
    refs.set(ref, { dataUrl, name: input.file.name })
    return {
      ref,
      dataUrl,
      storage: 'local',
      mime: input.file.type || 'application/octet-stream',
      size: input.file.size,
      name: input.file.name,
    }
  },

  async getUrl(attachment: AttachmentUrlSource): Promise<string> {
    if (attachment.dataUrl) return attachment.dataUrl
    if (attachment.storageRef) {
      const row = refs.get(attachment.storageRef)
      if (row) return row.dataUrl
    }
    if (attachment.mime === 'link/url') return attachment.dataUrl ?? ''
    throw new Error('File not found')
  },

  async remove(ref: string): Promise<void> {
    refs.delete(ref)
  },

  async zipMany(zipRefs: string[], names?: string[]): Promise<Blob> {
    const entries = zipRefs.map((ref, index) => {
      const row = refs.get(ref)
      if (!row) throw new Error('One or more files could not be found')
      return {
        name: names?.[index] ?? row.name,
        data: dataUrlToBlob(row.dataUrl),
      }
    })
    return buildZipBlob(entries)
  },
}
