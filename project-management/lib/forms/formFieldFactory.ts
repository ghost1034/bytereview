/**
 * Factory helpers for FormField creation and reordering.
 */
import { newId } from '../ids'
import type { EnumOption, FormField } from '../../types'

const OPTION_COLORS = ['#c4956a', '#8b7355', '#6b8f71', '#7d6b8f', '#b85c5c']

/** Create a new empty field of the given type. */
export function createFormField(type: FormField['type']): FormField {
  const id = newId()
  const base = { id, label: defaultLabel(type), required: false }
  switch (type) {
    case 'short_text':
      return { ...base, type, placeholder: 'Your answer' }
    case 'long_text':
      return { ...base, type, placeholder: 'Your answer' }
    case 'number':
      return { ...base, type }
    case 'date':
      return { ...base, type }
    case 'dropdown':
      return { ...base, type, options: [newOption('Option 1'), newOption('Option 2')] }
    case 'multi_select':
      return { ...base, type, options: [newOption('Option 1'), newOption('Option 2')] }
    case 'attachment':
      return { ...base, type }
  }
}

function defaultLabel(type: FormField['type']): string {
  const labels: Record<FormField['type'], string> = {
    short_text: 'Short text',
    long_text: 'Long text',
    number: 'Number',
    date: 'Date',
    dropdown: 'Single select',
    multi_select: 'Multi select',
    attachment: 'Attachment',
  }
  return labels[type]
}

/** Create a colored enum option for select fields. */
export function newOption(label: string, index = 0): EnumOption {
  return { id: newId(), label, color: OPTION_COLORS[index % OPTION_COLORS.length] ?? '#c4956a' }
}

/** Deep-clone a field with a new id. */
export function duplicateFormField(field: FormField): FormField {
  const id = newId()
  if (field.type === 'dropdown' || field.type === 'multi_select') {
    return {
      ...field,
      id,
      label: `${field.label} (copy)`,
      options: field.options.map((o) => ({ ...o, id: newId() })),
    }
  }
  return { ...field, id, label: `${field.label} (copy)` }
}

/** Move a field within the fields array by index. */
export function reorderFields(fields: FormField[], from: number, to: number): FormField[] {
  if (from === to || from < 0 || to < 0 || from >= fields.length || to >= fields.length) {
    return fields
  }
  const next = [...fields]
  const [item] = next.splice(from, 1)
  if (!item) return fields
  next.splice(to, 0, item)
  return next
}

/** Generate an 8-character public slug for published forms. */
export function generatePublicSlug(): string {
  return crypto.randomUUID().slice(0, 8)
}
