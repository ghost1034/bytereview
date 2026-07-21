interface FloatingToolbarFieldRect {
  posX: number
  posY: number
  width: number
  height: number
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)

export function getFloatingToolbarPosition(field: FloatingToolbarFieldRect, pageWidth: number, pageHeight: number) {
  const gutter = 8
  const width = Math.min(360, Math.max(0, pageWidth - gutter * 2))
  const fieldCenter = (field.posX + field.width / 2) * pageWidth
  const left = clamp(fieldCenter - width / 2, gutter, Math.max(gutter, pageWidth - width - gutter))
  const fieldTop = field.posY * pageHeight
  const placement = fieldTop < 52 ? 'below' : 'above'

  return {
    width,
    left,
    top: placement === 'above' ? fieldTop - 8 : (field.posY + field.height) * pageHeight + 8,
    arrowLeft: clamp(fieldCenter - left, 14, Math.max(14, width - 14)),
    placement,
  } as const
}
