import type { Attachment, ID } from '../../types'

export type FileStorageKind = Attachment['storage']

export type FileUploadInput = {
  file: File
  ownerId: ID
  scope: 'task' | 'comment' | 'project' | 'receipt' | 'invoice_brand'
  scopeId: ID
  workspaceId?: ID
}

export type FileUploadResult = {
  ref: string
  dataUrl?: string
  storage: FileStorageKind
  mime: string
  size: number
  name: string
}

export type AttachmentUrlSource = Pick<Attachment, 'dataUrl' | 'storageRef' | 'storage' | 'mime'>

/** Swappable file storage seam — V1 stores data URLs on attachment records. */
export interface FileStorageAdapter {
  upload(input: FileUploadInput): Promise<FileUploadResult>
  getUrl(attachment: AttachmentUrlSource): Promise<string>
  remove(ref: string): Promise<void>
  zipMany(refs: string[], names?: string[]): Promise<Blob>
  readonly capabilities: {
    maxFileSize: number
    supportsThumbnailing: boolean
    supportsVirusScan: boolean
    supportsServerSideZip: boolean
  }
}
