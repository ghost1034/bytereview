import { tasklyticApiJson } from '../tasklyticApi'
import { CLOUD_DRIVE_LABELS, type CloudDriveAdapter, type CloudDriveProvider } from './types'

const PROVIDERS: CloudDriveProvider[] = ['google_drive']

export const serverCloudDriveAdapter: CloudDriveAdapter = {
  providers: PROVIDERS,
  label: (provider) => CLOUD_DRIVE_LABELS[provider],
  isAvailable: (provider) => provider === 'google_drive',

  async availableProviders(workspaceId) {
    const response = await tasklyticApiJson<{ capabilities: { provider: string; available: boolean }[] }>(
      `/integrations/capabilities?workspace_id=${encodeURIComponent(workspaceId)}`,
    )
    return response.capabilities
      .filter((item) => item.provider === 'google_drive' && item.available)
      .map(() => 'google_drive' as const)
  },

  async listFiles(provider, workspaceId, query = '') {
    if (provider !== 'google_drive') return []
    const params = new URLSearchParams({ workspace_id: workspaceId })
    if (query.trim()) params.set('q', query.trim())
    const response = await tasklyticApiJson<{ files: { id: string; name: string; mimeType: string; size: number; modifiedTime?: string }[] }>(
      `/integrations/google-drive/files?${params}`,
    )
    return response.files
  },

  async importFiles(provider, input) {
    if (provider !== 'google_drive') return { status: 'failed' as const, imported: [], failures: [] }
    return tasklyticApiJson('/integrations/google-drive:import', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async connect(provider) {
    return {
      ok: false as const,
      reason: 'error' as const,
      message: `${CLOUD_DRIVE_LABELS[provider]} selection requires a workspace scope.`,
    }
  },
}
