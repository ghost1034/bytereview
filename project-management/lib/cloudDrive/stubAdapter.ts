/**
 * V1 cloud drive adapter — providers unavailable until OAuth is configured.
 *
 * Production swap-out:
 * - `NEXT_PUBLIC_GDRIVE_CLIENT_ID`, `NEXT_PUBLIC_ONEDRIVE_CLIENT_ID`, `NEXT_PUBLIC_DROPBOX_APP_KEY`
 * - Replace with OAuth-backed adapters that return `storage: 'cloud_drive'` attachment refs.
 */
import { CLOUD_DRIVE_LABELS, type CloudDriveAdapter, type CloudDriveProvider } from './types'

const PROVIDERS: CloudDriveProvider[] = ['google_drive', 'onedrive', 'dropbox']

export const stubCloudDriveAdapter: CloudDriveAdapter = {
  providers: PROVIDERS,

  label(provider: CloudDriveProvider): string {
    return CLOUD_DRIVE_LABELS[provider]
  },

  isAvailable(): boolean {
    return false
  },

  async connect(provider: CloudDriveProvider) {
    return {
      ok: false as const,
      reason: 'not_configured' as const,
      message: `${CLOUD_DRIVE_LABELS[provider]} is not configured. Set up OAuth in Settings → Integrations → Cloud Drives.`,
    }
  },
}
