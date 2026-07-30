/**
 * Query helpers for custom fields — exported for filter/sort/group menus (step 13).
 */
import type { CustomField, CustomFieldValue, Task } from '../../types'
import type { FilterFieldDef, GroupingKey } from '../query/types'
import { getTaskFieldValue } from './fieldValues'
import { fieldTypeLabel } from './fieldTypes'

function filterKindForType(
  type: CustomField['type']
): FilterFieldDef['kind'] {
  switch (type) {
    case 'text':
      return 'text'
    case 'number':
    case 'formula':
      return 'number'
    case 'date':
      return 'date'
    case 'people':
      return 'users'
    case 'dropdown':
    case 'multi_select':
      return 'enum'
    case 'checkbox':
      return 'boolean'
  }
}

/** Build filter field definitions for project custom fields. */
export function buildCustomFieldFilterDefs(fields: CustomField[]): FilterFieldDef[] {
  return fields.map((field) => ({
    id: `customField:${field.id}`,
    label: field.name,
    kind: filterKindForType(field.type),
    customFieldId: field.id,
  }))
}

/** Grouping key for a custom field. */
export function customFieldGroupKey(fieldId: string): GroupingKey {
  return `customField:${fieldId}`
}

/** Sortable field id for custom fields. */
export function customFieldSortKey(fieldId: string): string {
  return `customField:${fieldId}`
}

/** Resolve group label + color for a task's custom field value. */
export function customFieldGroupMeta(
  task: Task,
  field: CustomField,
  allFields: CustomField[]
): { key: string; label: string; color?: string; order: number } {
  const value = getTaskFieldValue(task, field, allFields)
  if (field.type === 'dropdown' && value.type === 'dropdown' && value.value) {
    const idx = field.options?.findIndex((o) => o.id === value.value) ?? -1
    const opt = field.options?.find((o) => o.id === value.value)
    return {
      key: value.value,
      label: opt?.label ?? 'Unset',
      color: opt?.color,
      order: idx >= 0 ? idx : 999,
    }
  }
  if (field.type === 'multi_select' && value.type === 'multi_select') {
    const labels =
      value.value
        .map((id) => field.options?.find((o) => o.id === id)?.label)
        .filter(Boolean)
        .join(', ') || 'None'
    return { key: labels, label: labels, order: 999 }
  }
  return {
    key: String(getSortableScalar(task, field, allFields) ?? 'empty'),
    label: String(getSortableScalar(task, field, allFields) ?? 'Empty'),
    order: 999,
  }
}

/** Scalar used for sorting custom field columns. */
export function getSortableScalar(
  task: Task,
  field: CustomField,
  allFields: CustomField[]
): string | number | boolean | null {
  const value = getTaskFieldValue(task, field, allFields)
  switch (value.type) {
    case 'text':
      return value.value.toLowerCase()
    case 'number':
      return value.value
    case 'date':
      return value.value
    case 'people':
      return value.value.join(',')
    case 'dropdown':
      return field.options?.find((o) => o.id === value.value)?.label ?? ''
    case 'multi_select':
      return value.value
        .map((id) => field.options?.find((o) => o.id === id)?.label)
        .filter(Boolean)
        .join(',')
    case 'checkbox':
      return value.value
    case 'formula':
      return typeof value.value === 'number' ? value.value : null
    default:
      return null
  }
}

/** Human-readable type reference for docs and column headers. */
export const CUSTOM_FIELD_TYPES_REFERENCE: { type: CustomField['type']; label: string; ops: string[] }[] = [
  { type: 'text', label: fieldTypeLabel('text'), ops: ['contains', 'is_empty'] },
  { type: 'number', label: fieldTypeLabel('number'), ops: ['eq', 'gt', 'lt', 'is_empty'] },
  { type: 'date', label: fieldTypeLabel('date'), ops: ['before', 'after', 'is_empty'] },
  { type: 'people', label: fieldTypeLabel('people'), ops: ['is', 'is_not', 'is_empty'] },
  { type: 'dropdown', label: fieldTypeLabel('dropdown'), ops: ['is', 'is_not', 'is_any_of'] },
  { type: 'multi_select', label: fieldTypeLabel('multi_select'), ops: ['is_any_of', 'is_none_of'] },
  { type: 'checkbox', label: fieldTypeLabel('checkbox'), ops: ['is'] },
  { type: 'formula', label: fieldTypeLabel('formula'), ops: ['eq', 'gt', 'lt'] },
]

export type { CustomFieldValue }
