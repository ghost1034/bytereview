export interface Rect { x: number; y: number; width: number; height: number }
export interface SnapGuide { axis: 'x' | 'y'; position: number; kind: 'edge' | 'center' }
export interface SnapResult { rect: Rect; guides: SnapGuide[] }

function points(rect: Rect, axis: 'x' | 'y'): Array<{ value: number; offset: number; kind: 'edge' | 'center' }> {
  if (axis === 'x') return [
    { value: rect.x, offset: 0, kind: 'edge' },
    { value: rect.x + rect.width / 2, offset: rect.width / 2, kind: 'center' },
    { value: rect.x + rect.width, offset: rect.width, kind: 'edge' },
  ]
  return [
    { value: rect.y, offset: 0, kind: 'edge' },
    { value: rect.y + rect.height / 2, offset: rect.height / 2, kind: 'center' },
    { value: rect.y + rect.height, offset: rect.height, kind: 'edge' },
  ]
}

export function snapRect(candidate: Rect, others: Rect[], thresholdX: number, thresholdY: number): SnapResult {
  const result = { ...candidate }
  const guides: SnapGuide[] = []
  for (const axis of ['x', 'y'] as const) {
    const threshold = axis === 'x' ? thresholdX : thresholdY
    const targets = [
      ...others.flatMap((rect) => points(rect, axis)),
      { value: 0.5, offset: 0, kind: 'center' as const },
    ]
    let best: { delta: number; position: number; kind: 'edge' | 'center' } | undefined
    for (const source of points(result, axis)) {
      for (const target of targets) {
        const delta = target.value - source.value
        if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
          best = { delta, position: target.value, kind: target.kind }
        }
      }
    }
    if (best) {
      if (axis === 'x') result.x += best.delta
      else result.y += best.delta
      guides.push({ axis, position: best.position, kind: best.kind })
    }
  }
  return { rect: result, guides }
}
