import { stubCloudDriveAdapter } from './stubAdapter'
import type { CloudDriveAdapter, CloudDriveProvider } from './types'

/** Returns the configured cloud drive adapter (V1: stub). */
export function getCloudDriveAdapter(): CloudDriveAdapter {
  return stubCloudDriveAdapter
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
  CloudDriveProvider,
} from './types'
export { CLOUD_DRIVE_LABELS } from './types'
