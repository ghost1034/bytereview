import { describe, expect, it } from 'vitest'
import { snapRect } from './snapping'

describe('snapRect', () => {
  it('snaps edges and reports a guide', () => {
    const result = snapRect({ x: 0.198, y: 0.1, width: 0.1, height: 0.1 }, [{ x: 0.3, y: 0.4, width: 0.1, height: 0.1 }], 0.005, 0.005)
    expect(result.rect.x).toBeCloseTo(0.2)
    expect(result.guides.some((guide) => guide.axis === 'x')).toBe(true)
  })
  it('snaps a center to the page center', () => {
    expect(snapRect({ x: 0.449, y: 0.2, width: 0.1, height: 0.1 }, [], 0.005, 0.005).rect.x).toBeCloseTo(0.45)
  })
})
