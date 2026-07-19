import { validateFormula } from './fieldLogic'

export interface RecipientDraft {
  name: string
  email: string
  role: 'signer' | 'cc'
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
  }
}

export interface FieldIssue { id: string; message: string; fieldId?: string }

export function recipientValidationError(rows: RecipientDraft[]): string | null {
  const complete = rows.filter((row) => row.name.trim() || row.email.trim())
  if (complete.some((row) => !row.name.trim() || !row.email.trim())) return 'Enter a name and email for every recipient.'
  if (complete.length === 0) return 'Add at least one recipient.'
  const emails = complete.map((row) => row.email.trim().toLowerCase())
  if (new Set(emails).size !== emails.length) return 'Each recipient must use a unique email address.'
  if (!complete.some((row) => row.role === 'signer')) return 'At least one recipient must be a signer.'
  return null
}

export function collectFieldIssues(fields: ComposerField[], signerIds: string[]): FieldIssue[] {
  const issues: FieldIssue[] = []
  const signerSet = new Set(signerIds)
  signerIds.forEach((recipientId) => {
    if (!fields.some((field) => field.participantId === recipientId && field.fieldType === 'signature')) {
      issues.push({ id: `signature-${recipientId}`, message: 'A signer is missing a signature field.' })
    }
    if (!fields.some((field) => field.participantId === recipientId && field.required)) {
      issues.push({ id: `required-${recipientId}`, message: 'A signer has no required field.' })
    }
  })
  fields.forEach((field) => {
    if (!signerSet.has(field.participantId)) issues.push({ id: `owner-${field.id}`, fieldId: field.id, message: 'Field is not assigned to a current signer.' })
    if (field.fieldType === 'dropdown' && !field.properties?.options?.length) issues.push({ id: `options-${field.id}`, fieldId: field.id, message: 'Dropdown needs at least one option.' })
    if (field.fieldType === 'radio' && (!field.properties?.group?.id || !field.properties?.option_value?.trim())) issues.push({ id: `radio-${field.id}`, fieldId: field.id, message: 'Radio option needs a group and value.' })
    if (field.fieldType === 'formula') {
      try { validateFormula(field.properties?.formula?.expression ?? '') }
      catch { issues.push({ id: `formula-${field.id}`, fieldId: field.id, message: 'Formula expression is invalid.' }) }
    }
    const parent = field.properties?.conditional?.parent_field_id
    if (parent && !fields.some((candidate) => candidate.id === parent)) issues.push({ id: `condition-${field.id}`, fieldId: field.id, message: 'Conditional field references a missing field.' })
  })
  return issues
}
