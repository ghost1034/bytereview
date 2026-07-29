export type EditorFieldType =
  | 'signature' | 'initials' | 'date_signed' | 'text' | 'checkbox'
  | 'auto_fill' | 'attachment' | 'radio' | 'dropdown' | 'formula' | 'stamp'
  | 'date' | 'number' | 'first_name' | 'last_name' | 'full_name' | 'email'
  | 'company' | 'title' | 'note'

export type AnchorRelativePosition = 'auto' | 'right' | 'left' | 'below' | 'above'
export type AnchorCrossAxisAlignment = 'auto' | 'start' | 'center' | 'end'

export const DEFAULT_ANCHOR_RELATIVE_POSITION: AnchorRelativePosition = 'auto'
export const DEFAULT_ANCHOR_CROSS_AXIS_ALIGNMENT: AnchorCrossAxisAlignment = 'auto'

export function serializeAnchorPosition(
  relativePosition: AnchorRelativePosition = DEFAULT_ANCHOR_RELATIVE_POSITION,
  crossAxisAlignment: AnchorCrossAxisAlignment = DEFAULT_ANCHOR_CROSS_AXIS_ALIGNMENT,
) {
  return {
    relative_position: relativePosition,
    cross_axis_alignment: crossAxisAlignment,
  }
}

/** Pixel coordinates for the server-computed dashed field preview. */
export function anchorPreviewPosition(match: { x: number; y: number }, page: { width: number; height: number }) {
  return { left: match.x * page.width, top: match.y * page.height }
}

const TEXT_FIELD_TYPES = new Set<EditorFieldType>([
  'date_signed', 'text', 'auto_fill', 'dropdown', 'formula', 'date', 'number',
  'first_name', 'last_name', 'full_name', 'email', 'company', 'title', 'note',
])

/** Fields whose entered or resolved value is rendered as text in the document. */
export function supportsTextAppearance(type: EditorFieldType): boolean {
  return TEXT_FIELD_TYPES.has(type)
}

export const supportsTextAlignment = supportsTextAppearance

export function resolveAnchorFieldType(armedType: EditorFieldType | null): EditorFieldType {
  return armedType ?? 'text'
}

export function anchorInstancesShareValue(type: EditorFieldType): boolean {
  return !['signature', 'initials', 'stamp', 'radio', 'attachment'].includes(type)
}
