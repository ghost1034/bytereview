import { gcsFileStorageAdapter } from './gcsAdapter'
import { localFileStorageAdapter } from './localAdapter'
import { usesTasklyticBackend } from '../runtimeMode'
import type { FileStorageAdapter } from './types'

/**
 * Returns the configured file storage adapter.
 *
 * Customer use always selects signed backend uploads. Inline browser data is
 * limited to tests and explicitly gated internal evaluation tooling.
 */
export function getFileStorageAdapter(): FileStorageAdapter {
  return usesTasklyticBackend() ? gcsFileStorageAdapter : localFileStorageAdapter
}

export type {
  AttachmentUrlSource,
  FileStorageAdapter,
  FileStorageKind,
  FileUploadInput,
  FileUploadResult,
} from './types'
