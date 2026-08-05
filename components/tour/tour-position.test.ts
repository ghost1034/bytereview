import { describe, expect, it } from 'vitest'
import { getTourPanelPosition, type TourTargetRect } from './tour-position'

const rect = (values: Partial<TourTargetRect>): TourTargetRect => ({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  width: 0,
  height: 0,
  ...values,
})

describe('getTourPanelPosition', () => {
  it('places the tour card beside a full-height sidebar', () => {
    const position = getTourPanelPosition(
      rect({ top: 0, left: 0, right: 280, bottom: 900, width: 280, height: 900 }),
      { viewportWidth: 1440, viewportHeight: 900, panelWidth: 320, panelHeight: 220, gap: 12 },
    )

    expect(position).toEqual({ top: 340, left: 292, width: 320 })
  })

  it('keeps the card visible beside a target near the bottom-right corner', () => {
    const position = getTourPanelPosition(
      rect({ top: 780, left: 1200, right: 1400, bottom: 840, width: 200, height: 60 }),
      { viewportWidth: 1440, viewportHeight: 900, panelWidth: 320, panelHeight: 220, gap: 12 },
    )

    expect(position).toEqual({ top: 664, left: 868, width: 320 })
    expect(position.left + position.width).toBeLessThanOrEqual(1424)
    expect(position.top + 220).toBeLessThanOrEqual(884)
  })

  it('centers the card when a step target is not mounted', () => {
    const position = getTourPanelPosition(null, {
      viewportWidth: 1024,
      viewportHeight: 768,
      panelWidth: 320,
      panelHeight: 220,
    })

    expect(position).toEqual({ top: 274, left: 352, width: 320 })
  })

  it('keeps the card inside a narrow mobile viewport', () => {
    const position = getTourPanelPosition(
      rect({ top: 0, left: 0, right: 320, bottom: 844, width: 320, height: 844 }),
      { viewportWidth: 390, viewportHeight: 844, panelWidth: 320, panelHeight: 220, gap: 12 },
    )

    expect(position.left).toBeGreaterThanOrEqual(16)
    expect(position.left + position.width).toBeLessThanOrEqual(374)
    expect(position.top).toBeGreaterThanOrEqual(16)
  })
})
