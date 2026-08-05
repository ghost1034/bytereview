export type TourTargetRect = Pick<
  DOMRect,
  'top' | 'right' | 'bottom' | 'left' | 'width' | 'height'
>

export type TourPanelPosition = {
  top: number
  left: number
  width: number
}

type PositionOptions = {
  viewportWidth: number
  viewportHeight: number
  panelWidth?: number
  panelHeight?: number
  margin?: number
  gap?: number
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max))

/** Keep a tour card visible while preferring a side that does not cover its target. */
export function getTourPanelPosition(
  target: TourTargetRect | null,
  {
    viewportWidth,
    viewportHeight,
    panelWidth = 360,
    panelHeight = 280,
    margin = 16,
    gap = 16,
  }: PositionOptions,
): TourPanelPosition {
  const width = Math.min(panelWidth, Math.max(0, viewportWidth - margin * 2))
  const height = Math.min(panelHeight, Math.max(0, viewportHeight - margin * 2))

  if (!target) {
    return {
      top: clamp((viewportHeight - height) / 2, margin, viewportHeight - height - margin),
      left: clamp((viewportWidth - width) / 2, margin, viewportWidth - width - margin),
      width,
    }
  }

  const centeredTop = clamp(
    target.top + (target.height - height) / 2,
    margin,
    viewportHeight - height - margin,
  )
  const centeredLeft = clamp(
    target.left + (target.width - width) / 2,
    margin,
    viewportWidth - width - margin,
  )

  if (target.right + gap + width <= viewportWidth - margin) {
    return { top: centeredTop, left: target.right + gap, width }
  }

  if (target.left - gap - width >= margin) {
    return { top: centeredTop, left: target.left - gap - width, width }
  }

  if (target.bottom + gap + height <= viewportHeight - margin) {
    return { top: target.bottom + gap, left: centeredLeft, width }
  }

  if (target.top - gap - height >= margin) {
    return { top: target.top - gap - height, left: centeredLeft, width }
  }

  return {
    top: clamp(target.top, margin, viewportHeight - height - margin),
    left: clamp(target.left, margin, viewportWidth - width - margin),
    width,
  }
}
