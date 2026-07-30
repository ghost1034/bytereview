export type CloudDriveProvider = 'google_drive' | 'onedrive' | 'dropbox'

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

/** Swappable cloud drive picker seam — V1 stub only. */
export interface CloudDriveAdapter {
  readonly providers: readonly CloudDriveProvider[]
  isAvailable(provider: CloudDriveProvider): boolean
  connect(provider: CloudDriveProvider): Promise<CloudDriveConnectResult>
  label(provider: CloudDriveProvider): string
}

export const CLOUD_DRIVE_LABELS: Record<CloudDriveProvider, string> = {
  google_drive: 'Google Drive',
  onedrive: 'Microsoft OneDrive',
  dropbox: 'Dropbox',
}
