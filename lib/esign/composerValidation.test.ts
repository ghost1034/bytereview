import { describe, expect, it } from 'vitest'

import { collectFieldIssues, recipientValidationError } from './composerValidation'

describe('recipientValidationError', () => {
  it('requires complete, unique recipients and at least one signer', () => {
    expect(recipientValidationError([{ name: '', email: '', role: 'signer' }])).toMatch('at least one')
    expect(recipientValidationError([{ name: 'One', email: '', role: 'signer' }])).toMatch('name and email')
    expect(recipientValidationError([
      { name: 'One', email: 'same@example.com', role: 'signer' },
      { name: 'Two', email: 'SAME@example.com', role: 'cc' },
    ])).toMatch('unique')
    expect(recipientValidationError([{ name: 'Copy', email: 'copy@example.com', role: 'cc' }])).toMatch('signer')
    expect(recipientValidationError([{ name: 'Signer', email: 'signer@example.com', role: 'signer' }])).toBeNull()
  })
})

describe('collectFieldIssues', () => {
  it('reports send-blocking signer and field configuration issues with field targets', () => {
    const issues = collectFieldIssues([
      { id: 'dropdown', participantId: 'signer-1', fieldType: 'dropdown', required: true, properties: { options: [] } },
      { id: 'orphan', participantId: 'deleted', fieldType: 'formula', required: false, properties: { formula: { expression: '1+', decimal_places: 2 } } },
    ], ['signer-1'])

    expect(issues.map((issue) => issue.id)).toEqual(expect.arrayContaining([
      'signature-signer-1', 'options-dropdown', 'owner-orphan', 'formula-orphan',
    ]))
    expect(issues.find((issue) => issue.id === 'options-dropdown')?.fieldId).toBe('dropdown')
  })
})
