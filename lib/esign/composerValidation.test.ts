import { describe, expect, it } from 'vitest'

import { collectFieldIssues, recipientValidationError } from './composerValidation'

describe('recipientValidationError', () => {
  it('requires complete, unique recipients and at least one actionable role', () => {
    expect(recipientValidationError([{ name: '', email: '', role: 'signer' }])).toMatch('at least one')
    expect(recipientValidationError([{ name: 'One', email: '', role: 'signer' }])).toMatch('name and email')
    expect(recipientValidationError([
      { name: 'One', email: 'same@example.com', role: 'signer' },
      { name: 'Two', email: 'SAME@example.com', role: 'cc' },
    ])).toMatch('unique')
    expect(recipientValidationError([{ name: 'Copy', email: 'copy@example.com', role: 'cc' }])).toMatch('actionable')
    expect(recipientValidationError([{ name: 'Reviewer', email: 'reviewer@example.com', role: 'approver' }])).toBeNull()
    expect(recipientValidationError([{ name: 'Signer', email: 'signer@example.com', role: 'signer' }])).toBeNull()
  })

  it('reports conditional cycles before review', () => {
    const issues = collectFieldIssues([
      { id: 'a', participantId: 'signer-1', fieldType: 'text', required: true, properties: { conditional: { parent_field_id: 'b' } } },
      { id: 'b', participantId: 'signer-1', fieldType: 'text', required: true, properties: { conditional: { parent_field_id: 'a' } } },
      { id: 'sig', participantId: 'signer-1', fieldType: 'signature', required: true },
    ], [{ id: 'signer-1', label: 'Client signer' }])
    expect(issues.some((issue) => issue.id.startsWith('cycle-'))).toBe(true)
  })

  it('reports formula cycles before review', () => {
    const issues = collectFieldIssues([
      { id: 'a', participantId: 'signer-1', fieldType: 'formula', required: false, properties: { data_label: 'a', formula: { expression: '[b] + 1', decimal_places: 2 } } },
      { id: 'b', participantId: 'signer-1', fieldType: 'formula', required: false, properties: { data_label: 'b', formula: { expression: '[a] + 1', decimal_places: 2 } } },
      { id: 'sig', participantId: 'signer-1', fieldType: 'signature', required: true },
    ], [{ id: 'signer-1', label: 'Client signer' }])

    expect(issues.some((issue) => issue.id.startsWith('cycle-'))).toBe(true)
  })
})

describe('collectFieldIssues', () => {
  it('reports send-blocking signer and field configuration issues with field targets', () => {
    const issues = collectFieldIssues([
      { id: 'dropdown', participantId: 'signer-1', fieldType: 'dropdown', required: true, properties: { options: [] } },
      { id: 'orphan', participantId: 'deleted', fieldType: 'formula', required: false, properties: { formula: { expression: '1+', decimal_places: 2 } } },
    ], ['signer-1'])

    expect(issues.map((issue) => issue.id)).toEqual(expect.arrayContaining([
      'options-dropdown', 'owner-orphan', 'formula-orphan',
    ]))
    expect(issues.some((issue) => issue.id === 'signature-signer-1')).toBe(false)
    expect(issues.find((issue) => issue.id === 'options-dropdown')?.fieldId).toBe('dropdown')
  })

  it('reports inconsistent and impossible choice groups', () => {
    const issues = collectFieldIssues([
      { id: 'r1', participantId: 'signer-1', fieldType: 'radio', required: true, properties: { group: { id: 'radio', label: 'Entity' }, option_value: 'same', read_only: true, sender_prefill: 'false' } },
      { id: 'r2', participantId: 'signer-1', fieldType: 'radio', required: true, properties: { group: { id: 'radio', label: 'Entity' }, option_value: 'same', read_only: true, sender_prefill: 'false' } },
      { id: 'c1', participantId: 'signer-1', fieldType: 'checkbox', required: false, properties: { selection_group: { id: 'checks', label: 'Pick', minimum_selected: 3, maximum_selected: 1 }, read_only: true, sender_prefill: 'true' } },
      { id: 'c2', participantId: 'signer-1', fieldType: 'checkbox', required: false, properties: { selection_group: { id: 'checks', label: 'Pick', minimum_selected: 3, maximum_selected: 1 }, read_only: true, sender_prefill: 'false' } },
    ], ['signer-1'])

    expect(issues.map((issue) => issue.id)).toEqual(expect.arrayContaining([
      'radio-values-radio', 'radio-locked-radio', 'checkbox-rule-checks', 'checkbox-locked-checks',
    ]))
  })

  it('reports malformed generated document-label links', () => {
    const issues = collectFieldIssues([
      { id: 'r1', participantId: 'signer-1', fieldType: 'radio', required: true, label: 'Yes', properties: { group: { id: 'radio', label: 'Proceed?' }, option_value: 'yes' } },
      { id: 'r2', participantId: 'signer-1', fieldType: 'radio', required: true, label: 'No', properties: { group: { id: 'radio', label: 'Proceed?' }, option_value: 'no' } },
      { id: 'question', participantId: 'signer-1', fieldType: 'note', required: false, properties: { sender_prefill: 'Stale', label_link: { kind: 'radio_group', source_id: 'radio', enabled: true } } },
      { id: 'yes-label', participantId: 'other', fieldType: 'note', required: false, properties: { sender_prefill: 'Yes', label_link: { kind: 'field', source_id: 'r1', enabled: false } } },
    ], ['signer-1'])

    expect(issues.map((issue) => issue.id)).toEqual(expect.arrayContaining([
      'generated-label-stale-question', 'generated-label-owner-yes-label',
      'generated-label-visibility-radio', 'generated-label-incomplete-radio',
    ]))
  })
})
