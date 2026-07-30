import { gcsFileStorageAdapter } from './gcsAdapter'
import { localFileStorageAdapter } from './localAdapter'
import type { FileStorageAdapter } from './types'

/**
 * Returns the configured file storage adapter.
 *
 * Selected via `NEXT_PUBLIC_FILE_STORAGE_ADAPTER`:
 * - `gcs` (or `object_store`) -> `gcsFileStorageAdapter`: signed-URL uploads to
 *   the shared private GCS bucket (same setup as Document Analysis), brokered by
 *   the backend `/api/tasklytic/files:*` routes. Required for large files.
 * - anything else (default)   -> `localFileStorageAdapter`: inline data URLs in
 *   localStorage (V1 fallback; only suitable for small files).
 */
export function getFileStorageAdapter(): FileStorageAdapter {
  const configured = process.env.NEXT_PUBLIC_FILE_STORAGE_ADAPTER
  if (
    process.env.NEXT_PUBLIC_TASKLYTIC_BACKEND === '1' ||
    configured === 'gcs' ||
    configured === 'object_store'
  ) {
    return gcsFileStorageAdapter
  }
  return localFileStorageAdapter
}

export type {
  AttachmentUrlSource,
  FileStorageAdapter,
  FileStorageKind,
  FileUploadInput,
  FileUploadResult,
} from './types'
