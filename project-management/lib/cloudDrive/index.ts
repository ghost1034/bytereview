import { stubCloudDriveAdapter } from './stubAdapter'
import { serverCloudDriveAdapter } from './serverAdapter'
import { usesTasklyticBackend } from '../runtimeMode'
import type { CloudDriveAdapter, CloudDriveProvider } from './types'

/** Returns the server adapter in production and a capability-empty local fallback. */
export function getCloudDriveAdapter(): CloudDriveAdapter {
  return usesTasklyticBackend() ? serverCloudDriveAdapter : stubCloudDriveAdapter
}

/** Providers are offered in the UI only after an adapter reports support. */
export function getAvailableCloudDriveProviders(
  adapter: CloudDriveAdapter = getCloudDriveAdapter(),
): CloudDriveProvider[] {
  return adapter.providers.filter((provider) => adapter.isAvailable(provider))
}

export type {
  CloudDriveAdapter,
  CloudDriveConnectResult,
  CloudDriveFile,
  CloudDriveImportInput,
  CloudDriveProvider,
} from './types'
export { CLOUD_DRIVE_LABELS } from './types'
