export type EditorFieldType =
  | 'signature' | 'initials' | 'date_signed' | 'text' | 'checkbox'
  | 'auto_fill' | 'attachment' | 'radio' | 'dropdown' | 'formula' | 'stamp'
  | 'date' | 'number' | 'first_name' | 'last_name' | 'full_name' | 'email'
  | 'company' | 'title' | 'note'

export function resolveAnchorFieldType(armedType: EditorFieldType | null): EditorFieldType {
  return armedType ?? 'text'
}

export function anchorInstancesShareValue(type: EditorFieldType): boolean {
  return !['signature', 'initials', 'stamp', 'radio', 'attachment'].includes(type)
}
