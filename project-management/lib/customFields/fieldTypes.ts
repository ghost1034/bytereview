/** Custom field type metadata for UI labels and icons. */
import type { CustomFieldType } from '../../types'

export type FieldEditorType =
  | 'text'
  | 'number'
  | 'enum'
  | 'date'
  | 'person'
  | 'multi_enum'
  | 'formula'
  | 'checkbox'

export const FIELD_EDITOR_TYPES: { id: FieldEditorType; label: string }[] = [
  { id: 'text', label: 'Text' },
  { id: 'number', label: 'Number' },
  { id: 'enum', label: 'Single select' },
  { id: 'date', label: 'Date' },
  { id: 'person', label: 'People' },
  { id: 'multi_enum', label: 'Multi-select' },
  { id: 'checkbox', label: 'Checkbox' },
  { id: 'formula', label: 'Formula' },
]

export function editorTypeToFieldType(editorType: FieldEditorType): CustomFieldType {
  switch (editorType) {
    case 'text':
      return 'text'
    case 'number':
      return 'number'
    case 'enum':
      return 'dropdown'
    case 'date':
      return 'date'
    case 'person':
      return 'people'
    case 'multi_enum':
      return 'multi_select'
    case 'formula':
      return 'formula'
    case 'checkbox':
      return 'checkbox'
  }
}

export function fieldTypeToEditorType(type: CustomFieldType): FieldEditorType {
  switch (type) {
    case 'dropdown':
      return 'enum'
    case 'multi_select':
      return 'multi_enum'
    case 'people':
      return 'person'
    default:
      return type as FieldEditorType
  }
}

export function fieldTypeLabel(type: CustomFieldType): string {
  switch (type) {
    case 'text':
      return 'Text'
    case 'number':
      return 'Number'
    case 'dropdown':
      return 'Single select'
    case 'date':
      return 'Date'
    case 'people':
      return 'People'
    case 'multi_select':
      return 'Multi-select'
    case 'formula':
      return 'Formula'
    case 'checkbox':
      return 'Checkbox'
  }
}

export const OPTION_COLORS = ['gray', 'accent', 'warning', 'danger', 'info', 'primary'] as const
