const ACTIVE_SOURCE_STATUSES = new Set(['pending', 'uploading', 'queued', 'processing'])
const ACTIVE_INGESTION_STATUSES = new Set(['queued', 'processing'])

export const INKWISE_SOURCE_POLL_INTERVAL_MS = 2000

export function isInkwiseSourceActiveStatus(status: string | null | undefined): boolean {
  return ACTIVE_SOURCE_STATUSES.has((status || '').trim().toLowerCase())
}

export function isInkwiseIngestionActiveStatus(status: string | null | undefined): boolean {
  return ACTIVE_INGESTION_STATUSES.has((status || '').trim().toLowerCase())
}
