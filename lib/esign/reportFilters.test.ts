import { describe, expect, it } from 'vitest'
import { buildEsignReportQuery } from './reportFilters'

describe('buildEsignReportQuery', () => {
  it('serializes the complete shared report filter contract', () => {
    expect(buildEsignReportQuery({
      start: '2026-07-01T00:00:00.000Z', end: '2026-08-01T00:00:00.000Z',
      source: 'bulk', status: 'completed', templateVersionId: 'version-id',
      senderUserId: 'sender-id', sourceId: 'bulk-job-id',
    }).toString()).toBe('start=2026-07-01T00%3A00%3A00.000Z&end=2026-08-01T00%3A00%3A00.000Z&source=bulk&status=completed&template_version_id=version-id&sender_user_id=sender-id&source_id=bulk-job-id')
  })

  it('omits unset optional filters', () => {
    expect([...buildEsignReportQuery({ start: 'a', end: 'b' }).keys()]).toEqual(['start', 'end'])
  })
})
