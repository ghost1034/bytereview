import { stubCloudDriveAdapter } from './stubAdapter'
import type { CloudDriveAdapter } from './types'

/** Returns the configured cloud drive adapter (V1: stub). */
export function getCloudDriveAdapter(): CloudDriveAdapter {
  return stubCloudDriveAdapter
}

export type {
  CloudDriveAdapter,
  CloudDriveConnectResult,
  CloudDriveProvider,
} from './types'
export { CLOUD_DRIVE_LABELS } from './types'
