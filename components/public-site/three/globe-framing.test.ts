import { describe, expect, it } from 'vitest'
import { getGlobeRadius } from './globe-framing'

describe('hero globe framing', () => {
  it.each([
    [1440, 900],
    [2560, 720],
    [768, 1024],
    [390, 844],
    [320, 608],
    [800, 800],
  ])('contains the globe with clearance in a %i × %i hero', (width, height) => {
    const distance = 6.5
    const fov = 45
    const radius = getGlobeRadius(width, height, distance, fov)
    const silhouetteSlope = radius / Math.sqrt(distance * distance - radius * radius)
    const projectedDiameter = silhouetteSlope / Math.tan(fov * Math.PI / 360) * height

    expect(radius).toBeGreaterThan(0)
    expect(radius).toBeLessThan(distance)
    expect(projectedDiameter).toBeCloseTo(Math.min(width, height) * 0.9)
    expect(projectedDiameter).toBeLessThan(width)
    expect(projectedDiameter).toBeLessThan(height)
  })

  it('stays finite before the canvas has a size', () => {
    expect(getGlobeRadius(0, 0, 6.5, 45)).toBe(0)
    expect(getGlobeRadius(1440, 0, 6.5, 45)).toBe(0)
    expect(getGlobeRadius(0, 900, 6.5, 45)).toBe(0)
  })
})
