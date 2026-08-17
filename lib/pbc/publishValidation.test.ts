import { describe, expect, it } from 'vitest'

import { getInvalidPbcRequestNumbers, getPbcPublishIssues } from './publishValidation'
import type { PbcContact, PbcRequestItem } from './types'

const request = (overrides: Partial<PbcRequestItem> = {}): PbcRequestItem => ({
  id: 'request-1',
  engagement_id: 'engagement-1',
  request_number: 'PBC-001',
  sort_order: 0,
  title: 'Bank reconciliation',
  priority: 'normal',
  expected_formats: [],
  sensitive: false,
  requires_redaction: false,
  dependency_ids: [],
  status: 'draft',
  revision: 1,
  assignments: [],
  documents: [],
  comments: [],
  updated_at: '2026-08-01T00:00:00Z',
  ...overrides,
})

const contact = (overrides: Partial<PbcContact> = {}): PbcContact => ({
  id: 'contact-1',
  name: 'Client contact',
  email: 'client@example.com',
  active: true,
  ...overrides,
})

describe('PBC publish validation', () => {
  it('parses invalid request numbers from a structured API detail', () => {
    expect(getInvalidPbcRequestNumbers({ invalid_requests: ['PBC-001', 42, 'PBC-002'] })).toEqual([
      'PBC-001',
      'PBC-002',
    ])
    expect(getInvalidPbcRequestNumbers({ message: 'Validation failed' })).toBeNull()
  })

  it('returns every missing field for only the requests rejected by the backend', () => {
    const requests = [
      request(),
      request({
        id: 'request-2',
        request_number: 'PBC-002',
        title: '',
        owner_user_id: null,
        due_date: null,
      }),
    ]

    expect(getPbcPublishIssues(requests, [contact()], ['PBC-002'])).toEqual([{
      requestId: 'request-2',
      requestNumber: 'PBC-002',
      missingFields: ['title', 'internal owner', 'due date', 'client recipient'],
    }])
  })

  it('accepts a coordinator or request assignment as the client recipient', () => {
    const invalid = ['PBC-001']
    const assigned = request({ assignments: [contact()] })

    expect(getPbcPublishIssues([assigned], [], invalid)[0].missingFields).toEqual([
      'internal owner',
      'due date',
    ])
    expect(getPbcPublishIssues([request()], [contact({ role: 'coordinator' })], invalid)[0].missingFields).toEqual([
      'internal owner',
      'due date',
    ])
  })
})
