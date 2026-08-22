export type ChoiceKind = 'dropdown' | 'radio' | 'checkbox-group'

export interface ChoiceOption {
  /** Stable persisted value. It is intentionally never presented to authors. */
  id: string
  label: string
  fieldId?: string
}

export interface ChoiceDraft {
  kind: ChoiceKind
  label: string
  participantId: string
  choices: ChoiceOption[]
  required: boolean
  defaultIds: string[]
  minimumSelected?: number
  maximumSelected?: number
  showLabels: boolean
}

export type CheckboxRulePreset = 'any' | 'at-least-one' | 'at-most-one' | 'exactly-one' | 'custom'

interface ChoiceFieldLike {
  id: string
  participantId: string
  fieldType: string
  required: boolean
  label?: string
  properties?: {
    options?: Array<{ value: string; label: string }>
    group?: { id: string; label?: string }
    option_value?: string
    sender_prefill?: string
    selection_group?: { id: string; label: string; minimum_selected?: number; maximum_selected?: number }
  }
}

export const createChoice = (label: string, createId: () => string): ChoiceOption => ({
  id: `option_${createId()}`,
  label,
})

export function normalizeDropdown(field: ChoiceFieldLike): ChoiceDraft {
  const choices = (field.properties?.options ?? []).map((option) => ({ id: option.value, label: option.label || option.value }))
  return {
    kind: 'dropdown',
    label: field.label || 'Select an option',
    participantId: field.participantId,
    choices,
    required: field.required,
    defaultIds: choices.some((choice) => choice.id === field.properties?.sender_prefill) ? [field.properties!.sender_prefill!] : [],
    showLabels: false,
  }
}

export function normalizeRadioGroup(fields: ChoiceFieldLike[], groupId: string): ChoiceDraft {
  const members = fields.filter((field) => field.fieldType === 'radio' && field.properties?.group?.id === groupId)
  const first = members[0]
  return {
    kind: 'radio',
    label: first?.properties?.group?.label || first?.label || 'Choose one',
    participantId: first?.participantId ?? '',
    choices: members.map((member, index) => ({
      id: member.properties?.option_value || `legacy_option_${index + 1}`,
      label: member.label?.trim() || member.properties?.option_value || `Choice ${index + 1}`,
      fieldId: member.id,
    })),
    required: first?.required ?? true,
    defaultIds: members.filter((member) => member.properties?.sender_prefill === 'true').map((member) => member.properties?.option_value || ''),
    showLabels: false,
  }
}

export function normalizeCheckboxGroup(fields: ChoiceFieldLike[], groupId: string): ChoiceDraft {
  const members = fields.filter((field) => field.fieldType === 'checkbox' && field.properties?.selection_group?.id === groupId)
  const first = members[0]
  const rule = first?.properties?.selection_group
  return {
    kind: 'checkbox-group',
    label: rule?.label || first?.label || 'Choose options',
    participantId: first?.participantId ?? '',
    choices: members.map((member, index) => ({
      id: member.id,
      fieldId: member.id,
      label: member.label?.trim() || `Choice ${index + 1}`,
    })),
    required: (rule?.minimum_selected ?? 0) > 0,
    defaultIds: members.filter((member) => member.properties?.sender_prefill === 'true').map((member) => member.id),
    minimumSelected: rule?.minimum_selected ?? 0,
    maximumSelected: rule?.maximum_selected,
    showLabels: false,
  }
}

export function checkboxRulePreset(minimum = 0, maximum?: number): CheckboxRulePreset {
  if (minimum === 0 && maximum == null) return 'any'
  if (minimum === 1 && maximum == null) return 'at-least-one'
  if (minimum === 0 && maximum === 1) return 'at-most-one'
  if (minimum === 1 && maximum === 1) return 'exactly-one'
  return 'custom'
}

export function checkboxRuleFromPreset(preset: CheckboxRulePreset, minimum = 0, maximum?: number) {
  if (preset === 'any') return { minimumSelected: 0, maximumSelected: undefined }
  if (preset === 'at-least-one') return { minimumSelected: 1, maximumSelected: undefined }
  if (preset === 'at-most-one') return { minimumSelected: 0, maximumSelected: 1 }
  if (preset === 'exactly-one') return { minimumSelected: 1, maximumSelected: 1 }
  return { minimumSelected: minimum, maximumSelected: maximum }
}

export function validateChoiceDraft(draft: ChoiceDraft): string[] {
  const errors: string[] = []
  const minimumChoices = draft.kind === 'dropdown' ? 1 : 2
  if (!draft.label.trim()) errors.push(draft.kind === 'dropdown' ? 'Enter a question or field label.' : 'Enter a question or group label.')
  if (!draft.participantId) errors.push('Choose a recipient.')
  if (draft.choices.length < minimumChoices) errors.push(`Add at least ${minimumChoices} choice${minimumChoices === 1 ? '' : 's'}.`)
  if (draft.choices.some((choice) => !choice.label.trim())) errors.push('Every choice needs a name.')
  if (new Set(draft.choices.map((choice) => choice.id)).size !== draft.choices.length) errors.push('Choices must have unique stored values.')
  if (draft.defaultIds.some((id) => !draft.choices.some((choice) => choice.id === id))) errors.push('A default choice is no longer available.')
  if (draft.kind === 'radio' && draft.defaultIds.length > 1) errors.push('A radio group can have only one default choice.')
  if (draft.kind === 'checkbox-group') {
    const minimum = draft.minimumSelected ?? 0
    const maximum = draft.maximumSelected
    if (minimum < 0 || maximum != null && maximum < 0) errors.push('Selection limits cannot be negative.')
    if (maximum != null && minimum > maximum) errors.push('The minimum cannot exceed the maximum.')
    if (minimum > draft.choices.length || maximum != null && maximum > draft.choices.length) errors.push('Selection limits cannot exceed the number of choices.')
  }
  return errors
}
