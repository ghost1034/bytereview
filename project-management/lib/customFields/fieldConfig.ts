/**
 * Extended custom field configuration stored additively on CustomField records.
 */
import type { CustomField } from '../../types'

/** Optional field config beyond the core CustomField shape (persisted at runtime). */
export type FieldExtras = {
  archived?: boolean
  multiline?: boolean
  required?: boolean
  numberPrecision?: number
  numberMin?: number
  numberMax?: number
  customLabel?: string
  peopleMulti?: boolean
  includeTime?: boolean
  formulaExpression?: string
}

export type ExtendedCustomField = CustomField & FieldExtras

/** Read extended config from a custom field record. */
export function asExtendedField(field: CustomField): ExtendedCustomField {
  return field as ExtendedCustomField
}

/** Whether the field is archived (hidden from pickers, values retained). */
export function isFieldArchived(field: CustomField): boolean {
  return Boolean(asExtendedField(field).archived)
}

/** Active workspace/library fields (non-archived). */
export function filterActiveFields(fields: CustomField[]): CustomField[] {
  return fields.filter((f) => !isFieldArchived(f))
}
