import { formulaReferences, validateFormula, type EsignFieldType } from './fieldLogic'

export interface RecipientDraft {
  name: string
  email: string
  role: 'signer' | 'cc' | 'approver' | 'certified_delivery' | 'agent' | 'editor' | 'witness' | 'in_person_signer'
  managedByRecipientId?: string
  witnessForRecipientId?: string
  witnessMode?: 'remote' | 'in_person'
  hostName?: string
  hostEmail?: string
}

export interface ComposerField {
  id: string
  participantId: string
  fieldType: EsignFieldType
  required: boolean
  properties?: {
    options?: Array<{ value: string; label: string }>
    group?: { id: string; label?: string }
    option_value?: string
    formula?: { expression: string; decimal_places: number }
    conditional?: { parent_field_id: string }
    data_label?: string
    shared_value?: boolean
    sender_prefill?: string
    read_only?: boolean
    allowed_types?: string[]
    selection_group?: { id: string; label: string; minimum_selected?: number; maximum_selected?: number; validation_message?: string }
  }
}

export interface FieldIssue { id: string; message: string; fieldId?: string }

export function recipientValidationError(rows: RecipientDraft[]): string | null {
  const complete = rows.filter((row) => row.name.trim() || row.email.trim() || row.managedByRecipientId)
  const identityOptional = (row: RecipientDraft) => !!row.managedByRecipientId || row.role === 'in_person_signer' || row.role === 'witness'
  if (complete.some((row) => !identityOptional(row) && (!row.name.trim() || !row.email.trim()))) return 'Enter a name and email for every remote recipient.'
  if (complete.length === 0) return 'Add at least one recipient.'
  const emails = complete.map((row) => row.email.trim().toLowerCase()).filter(Boolean)
  if (new Set(emails).size !== emails.length) return 'Each recipient must use a unique email address.'
  if (!complete.some((row) => row.role !== 'cc')) return 'Add at least one actionable recipient.'
  if (complete.some((row) => row.role === 'witness' && !row.witnessForRecipientId)) return 'Link every witness to a signer.'
  if (complete.some((row) => row.role === 'witness' && (row.witnessMode ?? 'remote') === 'remote' && (!row.name.trim() || !row.email.trim()))) return 'Enter a name and email for every remote witness.'
  if (complete.some((row) => row.role === 'in_person_signer' && (!row.hostName?.trim() || !row.hostEmail?.trim()))) return 'Enter a verified host name and email for every in-person signer.'
  return null
}

export function collectFieldIssues(
  fields: ComposerField[],
  signers: Array<string | { id: string; label: string }>,
): FieldIssue[] {
  const issues: FieldIssue[] = []
  const signerIds = signers.map((signer) => typeof signer === 'string' ? signer : signer.id)
  const labels = new Map(signers.map((signer) => typeof signer === 'string' ? [signer, 'Signer'] : [signer.id, signer.label]))
  const signerSet = new Set(signerIds)
  signerIds.forEach((recipientId) => {
    const actionable = new Set(['signature', 'initials', 'stamp', 'text', 'number', 'date', 'company', 'title', 'checkbox', 'radio', 'dropdown', 'attachment'])
    if (!fields.some((field) => field.participantId === recipientId && actionable.has(field.fieldType))) {
      issues.push({ id: `actionable-${recipientId}`, message: `${labels.get(recipientId) ?? 'Signer'} has no actionable field.` })
    }
  })
  fields.forEach((field) => {
    if (!signerSet.has(field.participantId)) issues.push({ id: `owner-${field.id}`, fieldId: field.id, message: 'Field is not assigned to a current signer.' })
    if (field.fieldType === 'dropdown' && !field.properties?.options?.length) issues.push({ id: `options-${field.id}`, fieldId: field.id, message: 'Dropdown needs at least one option.' })
    if (field.fieldType === 'dropdown' && field.properties?.options) {
      const values = field.properties.options.map((option) => option.value)
      if (field.properties.options.some((option) => !option.label.trim())) issues.push({ id: `option-labels-${field.id}`, fieldId: field.id, message: 'Every dropdown option needs a name.' })
      if (new Set(values).size !== values.length) issues.push({ id: `option-values-${field.id}`, fieldId: field.id, message: 'Dropdown option values must be unique.' })
      if (field.properties.sender_prefill && !values.includes(field.properties.sender_prefill)) issues.push({ id: `default-${field.id}`, fieldId: field.id, message: 'Dropdown default must match a listed option.' })
    }
    if (field.fieldType === 'radio' && (!field.properties?.group?.id || !field.properties?.option_value?.trim())) issues.push({ id: `radio-${field.id}`, fieldId: field.id, message: 'Radio option needs a group and value.' })
    if (field.fieldType === 'attachment' && !field.properties?.allowed_types?.length) issues.push({ id: `mime-${field.id}`, fieldId: field.id, message: 'Attachment needs at least one allowed file type.' })
    if (field.required && field.properties?.read_only && field.fieldType !== 'radio' && !field.properties?.selection_group && !field.properties.sender_prefill) issues.push({ id: `locked-${field.id}`, fieldId: field.id, message: 'Required locked field needs a sender value.' })
    const selection = field.properties?.selection_group
    if (selection?.maximum_selected != null && (selection.minimum_selected ?? 0) > selection.maximum_selected) issues.push({ id: `selection-${field.id}`, fieldId: field.id, message: 'Selection-group minimum cannot exceed its maximum.' })
    if (field.fieldType === 'formula') {
      try {
        const expression = field.properties?.formula?.expression ?? ''
        validateFormula(expression)
        const candidates = fields.filter((candidate) => candidate.participantId === field.participantId)
        if (formulaReferences(expression).some((reference) => !candidates.some((candidate) => candidate.id === reference || candidate.properties?.data_label === reference))) {
          issues.push({ id: `formula-owner-${field.id}`, fieldId: field.id, message: 'Formula references must belong to the same signer.' })
        }
      }
      catch { issues.push({ id: `formula-${field.id}`, fieldId: field.id, message: 'Formula expression is invalid.' }) }
    }
    const conditional = field.properties?.conditional
    const parent = conditional?.parent_field_id
    if (conditional && !parent) issues.push({ id: `condition-empty-${field.id}`, fieldId: field.id, message: 'Conditional field must choose a parent field.' })
    else if (parent && !fields.some((candidate) => candidate.id === parent)) issues.push({ id: `condition-${field.id}`, fieldId: field.id, message: 'Conditional field references a missing field.' })
    else if (parent && !fields.some((candidate) => candidate.id === parent && candidate.participantId === field.participantId)) issues.push({ id: `condition-owner-${field.id}`, fieldId: field.id, message: 'Conditional fields must belong to the same signer.' })
  })
  const labelsByOwner = new Map<string, ComposerField>()
  for (const field of fields) {
    const label = field.properties?.data_label?.trim()
    if (!label) continue
    const key = `${field.participantId}:${label}`
    const previous = labelsByOwner.get(key)
    if (previous && !(previous.properties?.shared_value && field.properties?.shared_value)) {
      issues.push({ id: `label-${field.id}`, fieldId: field.id, message: `Data label “${label}” must be unique unless both fields share values.` })
    } else labelsByOwner.set(key, field)
  }
  const radioGroups = new Map<string, ComposerField[]>()
  const checkboxGroups = new Map<string, ComposerField[]>()
  for (const field of fields) {
    const radioGroup = field.fieldType === 'radio' ? field.properties?.group?.id : undefined
    if (radioGroup) radioGroups.set(radioGroup, [...(radioGroups.get(radioGroup) ?? []), field])
    const checkboxGroup = field.fieldType === 'checkbox' ? field.properties?.selection_group?.id : undefined
    if (checkboxGroup) checkboxGroups.set(checkboxGroup, [...(checkboxGroups.get(checkboxGroup) ?? []), field])
  }
  for (const [group, members] of radioGroups) {
    if (new Set(members.map((field) => field.participantId)).size > 1 || new Set(members.map((field) => field.required)).size > 1 || new Set(members.map((field) => field.properties?.group?.label ?? '')).size > 1) {
      issues.push({ id: `radio-group-${group}`, fieldId: members[0]?.id, message: 'Radio group members must share one recipient, label, and required state.' })
    }
    if (members.filter((field) => field.properties?.sender_prefill === 'true').length > 1) {
      issues.push({ id: `radio-default-${group}`, fieldId: members[0]?.id, message: 'Radio group can have only one default option.' })
    }
    const values = members.map((field) => field.properties?.option_value?.trim() ?? '')
    if (values.some((value) => !value) || new Set(values).size !== values.length) issues.push({ id: `radio-values-${group}`, fieldId: members[0]?.id, message: 'Radio group choices must have unique stored values.' })
    if (members.every((field) => field.properties?.read_only) && members[0]?.required && members.filter((field) => field.properties?.sender_prefill === 'true').length !== 1) {
      issues.push({ id: `radio-locked-${group}`, fieldId: members[0]?.id, message: 'A required read-only radio group needs one default choice.' })
    }
  }
  for (const [group, members] of checkboxGroups) {
    const definitions = members.map((field) => JSON.stringify(field.properties?.selection_group))
    if (new Set(members.map((field) => field.participantId)).size > 1 || new Set(definitions).size > 1) {
      issues.push({ id: `checkbox-group-${group}`, fieldId: members[0]?.id, message: 'Checkbox group members must share one recipient and selection rule.' })
    }
    const rule = members[0]?.properties?.selection_group
    const minimum = rule?.minimum_selected ?? 0
    const maximum = rule?.maximum_selected
    if (minimum < 0 || maximum != null && maximum < 0 || maximum != null && minimum > maximum || minimum > members.length || maximum != null && maximum > members.length) {
      issues.push({ id: `checkbox-rule-${group}`, fieldId: members[0]?.id, message: 'Checkbox group selection rule is impossible for its number of choices.' })
    }
    if (members.every((field) => field.properties?.read_only)) {
      const selected = members.filter((field) => field.properties?.sender_prefill === 'true').length
      if (selected < minimum || maximum != null && selected > maximum) issues.push({ id: `checkbox-locked-${group}`, fieldId: members[0]?.id, message: 'Read-only checkbox defaults must satisfy the selection rule.' })
    }
  }
  const visiting = new Set<string>(); const visited = new Set<string>()
  const byId = new Map(fields.map((field) => [field.id, field]))
  const visit = (field: ComposerField): boolean => {
    if (visiting.has(field.id)) return true
    if (visited.has(field.id)) return false
    visiting.add(field.id)
    const parent = field.properties?.conditional?.parent_field_id
    const cyclic = !!parent && !!byId.get(parent) && visit(byId.get(parent)!)
    visiting.delete(field.id); visited.add(field.id)
    return cyclic
  }
  for (const field of fields) if (visit(field)) issues.push({ id: `cycle-${field.id}`, fieldId: field.id, message: 'Field dependency cycle detected.' })
  return issues
}
