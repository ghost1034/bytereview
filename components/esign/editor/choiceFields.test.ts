import { describe, expect, it } from 'vitest'

import {
  checkboxRuleFromPreset,
  checkboxRulePreset,
  createChoice,
  normalizeCheckboxGroup,
  normalizeDropdown,
  normalizeRadioGroup,
  validateChoiceDraft,
} from './choiceFields'

describe('choice field adapters', () => {
  it('keeps persisted dropdown values while exposing human labels', () => {
    const draft = normalizeDropdown({
      id: 'd', participantId: 'p', fieldType: 'dropdown', required: true, label: 'Entity type',
      properties: { options: [{ value: 'stable-a', label: 'Partnership' }], sender_prefill: 'stable-a' },
    })
    expect(draft.choices).toEqual([{ id: 'stable-a', label: 'Partnership' }])
    expect(draft.defaultIds).toEqual(['stable-a'])
  })

  it('derives legacy radio names without changing option values', () => {
    const draft = normalizeRadioGroup([
      { id: 'a', participantId: 'p', fieldType: 'radio', required: true, properties: { group: { id: 'g', label: 'Entity type' }, option_value: 'partnership' } },
      { id: 'b', participantId: 'p', fieldType: 'radio', required: true, label: 'Corporation', properties: { group: { id: 'g', label: 'Entity type' }, option_value: 'corp' } },
    ], 'g')
    expect(draft.choices.map((choice) => [choice.id, choice.label])).toEqual([
      ['partnership', 'partnership'], ['corp', 'Corporation'],
    ])
  })

  it('normalizes checkbox metadata and converts rule presets', () => {
    const draft = normalizeCheckboxGroup([
      { id: 'a', participantId: 'p', fieldType: 'checkbox', required: false, label: 'Email', properties: { selection_group: { id: 'g', label: 'Contact methods', minimum_selected: 1, maximum_selected: 1 } } },
      { id: 'b', participantId: 'p', fieldType: 'checkbox', required: false, label: 'Phone', properties: { selection_group: { id: 'g', label: 'Contact methods', minimum_selected: 1, maximum_selected: 1 } } },
    ], 'g')
    expect(draft.choices.map((choice) => choice.label)).toEqual(['Email', 'Phone'])
    expect(checkboxRulePreset(draft.minimumSelected, draft.maximumSelected)).toBe('exactly-one')
    expect(checkboxRuleFromPreset('at-least-one')).toEqual({ minimumSelected: 1, maximumSelected: undefined })
  })

  it('generates stable opaque values and reports impossible rules', () => {
    expect(createChoice('One', () => 'fixed')).toEqual({ id: 'option_fixed', label: 'One' })
    expect(validateChoiceDraft({
      kind: 'checkbox-group', label: 'Pick', participantId: 'p', required: true,
      choices: [{ id: 'same', label: '' }, { id: 'same', label: 'Two' }], defaultIds: [], minimumSelected: 3, maximumSelected: 1,
    })).toEqual(expect.arrayContaining([
      'Every choice needs a name.', 'Choices must have unique stored values.',
      'The minimum cannot exceed the maximum.', 'Selection limits cannot exceed the number of choices.',
    ]))
  })
})
