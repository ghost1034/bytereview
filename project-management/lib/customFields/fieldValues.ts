/**
 * Custom field value resolution and formula computation.
 */
import type { CustomField, CustomFieldValue, Task } from '../../types'
import { asExtendedField } from './fieldConfig'
import { evaluateFormula } from './formula'

function defaultValueForField(field: CustomField): CustomFieldValue {
  switch (field.type) {
    case 'text':
      return { type: 'text', value: '' }
    case 'number':
      return { type: 'number', value: null }
    case 'date':
      return { type: 'date', value: null }
    case 'people':
      return { type: 'people', value: [] }
    case 'dropdown':
      return { type: 'dropdown', value: null }
    case 'multi_select':
      return { type: 'multi_select', value: [] }
    case 'formula':
      return { type: 'formula', value: null }
    case 'checkbox':
      return { type: 'checkbox', value: false }
  }
}

function numericFromValue(
  field: CustomField,
  value: CustomFieldValue,
  task: Task,
  fields: CustomField[]
): number {
  switch (field.type) {
    case 'number':
      return value.type === 'number' && value.value != null ? value.value : 0
    case 'checkbox':
      return value.type === 'checkbox' && value.value ? 1 : 0
    case 'formula': {
      const r = computeFormula(task, field, fields)
      return r.ok && r.value != null ? r.value : 0
    }
    default:
      return 0
  }
}

/** Compute a formula field value for a task (live, not persisted). */
export function computeFormula(
  task: Task,
  field: CustomField,
  fields: CustomField[]
): { ok: true; value: number | null } | { ok: false; error: string } {
  const expr = asExtendedField(field).formulaExpression?.trim()
  if (!expr) return { ok: true, value: null }
  return evaluateFormula(expr, (name) => {
    const ref = fields.find((f) => f.name.toLowerCase() === name.toLowerCase())
    if (!ref) return 0
    const val = getTaskFieldValue(task, ref, fields)
    return numericFromValue(ref, val, task, fields)
  })
}

/** Read a task's value for a field, computing formulas on the fly. */
export function getTaskFieldValue(
  task: Task,
  field: CustomField,
  allFields?: CustomField[]
): CustomFieldValue {
  if (field.type === 'formula') {
    const fields = allFields ?? [field]
    const result = computeFormula(task, field, fields)
    if (!result.ok) return { type: 'formula', value: result.error }
    return { type: 'formula', value: result.value }
  }
  const stored = task.customFieldValues[field.id]
  return stored ?? defaultValueForField(field)
}

/** Whether a required field is empty on a task. */
export function isRequiredFieldEmpty(task: Task, field: CustomField, allFields?: CustomField[]): boolean {
  if (!asExtendedField(field).required) return false
  const value = getTaskFieldValue(task, field, allFields)
  switch (value.type) {
    case 'text':
      return !value.value.trim()
    case 'number':
      return value.value == null
    case 'date':
      return !value.value
    case 'people':
    case 'multi_select':
      return value.value.length === 0
    case 'dropdown':
      return !value.value
    case 'checkbox':
      return false
    case 'formula':
      return value.value == null
    default:
      return false
  }
}

export { defaultValueForField }
