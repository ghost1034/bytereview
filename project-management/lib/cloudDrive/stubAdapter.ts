/** Local/evaluation fallback. It advertises no provider capabilities. */
import { CLOUD_DRIVE_LABELS, type CloudDriveAdapter, type CloudDriveProvider } from './types'

const PROVIDERS: CloudDriveProvider[] = ['google_drive']

export const stubCloudDriveAdapter: CloudDriveAdapter = {
  providers: PROVIDERS,

  label(provider: CloudDriveProvider): string {
    return CLOUD_DRIVE_LABELS[provider]
  },

  isAvailable(): boolean {
    return false
  },

  async availableProviders() {
    return []
  },

  async listFiles() {
    return []
  },

  async importFiles() {
    return { status: 'failed' as const, imported: [], failures: [] }
  },

  async connect(provider: CloudDriveProvider) {
    return {
      ok: false as const,
      reason: 'not_configured' as const,
      message: `${CLOUD_DRIVE_LABELS[provider]} is unavailable.`,
    }
  },
}
