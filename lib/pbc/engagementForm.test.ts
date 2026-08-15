import { describe, expect, it } from 'vitest'

import { parsePbcEngagementSource, pbcEngagementSourcePayload, pbcRolloverCandidates } from './engagementForm'
import type { PbcEngagement } from './types'

const engagement = (overrides: Partial<PbcEngagement>): PbcEngagement => ({
  id: 'engagement-1',
  firm_id: 'firm-1',
  client_id: 'client-1',
  name: 'Prior audit',
  client_name: 'Acme',
  engagement_type: 'audit',
  status: 'completed',
  reminders_paused: false,
  revision: 1,
  progress: 100,
  request_count: 12,
  status_counts: { accepted: 12 },
  updated_at: '2026-08-01T00:00:00Z',
  ...overrides,
})

describe('PBC engagement creation helpers', () => {
  it('distinguishes blank, template, and rollover sources', () => {
    expect(parsePbcEngagementSource('blank')).toEqual({ kind: 'blank' })
    expect(parsePbcEngagementSource('template:template-1')).toEqual({ kind: 'template', id: 'template-1' })
    expect(parsePbcEngagementSource('rollover:engagement-1')).toEqual({ kind: 'rollover', id: 'engagement-1' })
    expect(pbcEngagementSourcePayload(parsePbcEngagementSource('template:template-1'))).toEqual({
      template_id: 'template-1',
      rollover_from_id: null,
    })
    expect(pbcEngagementSourcePayload(parsePbcEngagementSource('rollover:engagement-1'))).toEqual({
      template_id: null,
      rollover_from_id: 'engagement-1',
    })
  })

  it('offers rollover sources only for the selected client', () => {
    const rows = [
      engagement({ id: 'same-client' }),
      engagement({ id: 'other-client', client_id: 'client-2' }),
      engagement({ id: 'archived-same-client', status: 'archived' }),
    ]

    expect(pbcRolloverCandidates(rows, 'client-1').map((row) => row.id)).toEqual([
      'same-client',
      'archived-same-client',
    ])
    expect(pbcRolloverCandidates(rows, '')).toEqual([])
  })
})
