import type { SnapGuide } from './snapping'

export function AlignmentGuides({ guides, width, height }: { guides: SnapGuide[]; width: number; height: number }) {
  return <>{guides.map((guide, index) => (
    <span
      key={`${guide.axis}-${guide.position}-${index}`}
      className="pointer-events-none absolute z-30 bg-fuchsia-500"
      style={guide.axis === 'x'
        ? { left: guide.position * width, top: 0, width: 1, height }
        : { top: guide.position * height, left: 0, height: 1, width }}
    />
  ))}</>
}
