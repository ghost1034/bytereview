export type CloudDriveProvider = 'google_drive'

export type CloudDriveConnectResult =
  | {
      ok: true
      storageRef: string
      name: string
      mime: string
      size: number
      downloadUrl?: string
    }
  | { ok: false; reason: 'not_configured' | 'cancelled' | 'error'; message?: string }

export type CloudDriveFile = {
  id: string
  name: string
  mimeType: string
  size: number
  modifiedTime?: string
}

export type CloudDriveImportInput = {
  workspaceId: string
  scope: 'task' | 'project'
  scopeId: string
  fileIds: string[]
}

/** Swappable cloud drive picker seam — V1 stub only. */
export interface CloudDriveAdapter {
  readonly providers: readonly CloudDriveProvider[]
  isAvailable(provider: CloudDriveProvider): boolean
  availableProviders(workspaceId: string): Promise<CloudDriveProvider[]>
  listFiles(provider: CloudDriveProvider, workspaceId: string, query?: string): Promise<CloudDriveFile[]>
  importFiles(provider: CloudDriveProvider, input: CloudDriveImportInput): Promise<{ status: 'succeeded' | 'partial' | 'failed'; imported: { attachmentId: string }[]; failures: { fileId: string; code: string }[] }>
  connect(provider: CloudDriveProvider): Promise<CloudDriveConnectResult>
  label(provider: CloudDriveProvider): string
}

export const CLOUD_DRIVE_LABELS: Record<CloudDriveProvider, string> = {
  google_drive: 'Google Drive',
}
