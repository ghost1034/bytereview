export type EditorFieldType =
  | 'signature' | 'initials' | 'date_signed' | 'text' | 'checkbox'
  | 'auto_fill' | 'attachment' | 'radio' | 'dropdown' | 'formula' | 'stamp'
  | 'date' | 'number' | 'first_name' | 'last_name' | 'full_name' | 'email'
  | 'company' | 'title' | 'note'

const TEXT_FIELD_TYPES = new Set<EditorFieldType>([
  'date_signed', 'text', 'auto_fill', 'dropdown', 'formula', 'date', 'number',
  'first_name', 'last_name', 'full_name', 'email', 'company', 'title', 'note',
])

/** Fields whose entered or resolved value is rendered as text in the document. */
export function supportsTextAlignment(type: EditorFieldType): boolean {
  return TEXT_FIELD_TYPES.has(type)
}

export function resolveAnchorFieldType(armedType: EditorFieldType | null): EditorFieldType {
  return armedType ?? 'text'
}

export function anchorInstancesShareValue(type: EditorFieldType): boolean {
  return !['signature', 'initials', 'stamp', 'radio', 'attachment'].includes(type)
}
