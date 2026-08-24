import { describe, expect, it } from 'vitest'
import { buildContactPayload } from './ContactForm'

describe('buildContactPayload', () => {
  it('constructs the generated contact contract and trims text', () => {
    expect(buildContactPayload({ name: '  Ada Lovelace ', email: ' ada@example.com ', company: ' ', inquiryType: 'Enterprise solutions', subject: '  Workflow ', message: '  Help us automate. ' })).toEqual({
      name: 'Ada Lovelace', email: 'ada@example.com', company: null,
      inquiryType: 'Enterprise solutions', subject: 'Workflow', message: 'Help us automate.',
    })
  })
})
