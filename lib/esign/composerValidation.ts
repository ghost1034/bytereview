import { formulaReferences, validateFormula } from './fieldLogic'

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
  fieldType: string
  required: boolean
  properties?: {
    options?: Array<{ value: string; label: string }>
    group?: { id: string; label?: string }
    option_value?: string
    formula?: { expression: string; decimal_places: number }
    conditional?: { parent_field_id: string }
    data_label?: string
    shared_value?: boolean
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
    if (!fields.some((field) => field.participantId === recipientId && field.fieldType === 'signature')) {
      issues.push({ id: `signature-${recipientId}`, message: `${labels.get(recipientId) ?? 'Signer'} is missing a signature field.` })
    }
    if (!fields.some((field) => field.participantId === recipientId && field.required)) {
      issues.push({ id: `required-${recipientId}`, message: `${labels.get(recipientId) ?? 'Signer'} has no required field.` })
    }
  })
  fields.forEach((field) => {
    if (!signerSet.has(field.participantId)) issues.push({ id: `owner-${field.id}`, fieldId: field.id, message: 'Field is not assigned to a current signer.' })
    if (field.fieldType === 'dropdown' && !field.properties?.options?.length) issues.push({ id: `options-${field.id}`, fieldId: field.id, message: 'Dropdown needs at least one option.' })
    if (field.fieldType === 'radio' && (!field.properties?.group?.id || !field.properties?.option_value?.trim())) issues.push({ id: `radio-${field.id}`, fieldId: field.id, message: 'Radio option needs a group and value.' })
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
