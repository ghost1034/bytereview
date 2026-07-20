import type { EsignReportFilters } from '@/lib/api'

/** One query contract shared by report summary, trend, and detail export. */
export function buildEsignReportQuery(params: EsignReportFilters): URLSearchParams {
  const query = new URLSearchParams({ start: params.start, end: params.end })
  if (params.source) query.set('source', params.source)
  if (params.status) query.set('status', params.status)
  if (params.templateVersionId) query.set('template_version_id', params.templateVersionId)
  if (params.senderUserId) query.set('sender_user_id', params.senderUserId)
  if (params.sourceId) query.set('source_id', params.sourceId)
  return query
}
