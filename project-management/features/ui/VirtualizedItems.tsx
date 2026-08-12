'use client'

import { useMemo, useState, type ReactNode } from 'react'

type Props<T> = {
  items: T[]
  rowHeight: number
  threshold?: number
  renderItem: (item: T, index: number) => ReactNode
}

/** Bounded window for long search/activity/file collections. */
export function VirtualizedItems<T>({ items, rowHeight, threshold = 100, renderItem }: Props<T>) {
  const [scrollTop, setScrollTop] = useState(0)
  const windowed = items.length > threshold
  const viewportHeight = 560
  const overscan = 8
  const start = windowed ? Math.max(0, Math.floor(scrollTop / rowHeight) - overscan) : 0
  const end = windowed ? Math.min(items.length, start + Math.ceil(viewportHeight / rowHeight) + overscan * 2) : items.length
  const visible = useMemo(() => items.slice(start, end), [end, items, start])
  if (!windowed) return <>{visible.map((item, index) => renderItem(item, index))}</>
  return (
    <div className="overflow-auto" style={{ maxHeight: viewportHeight }} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      <div style={{ height: start * rowHeight }} aria-hidden />
      {visible.map((item, index) => renderItem(item, start + index))}
      <div style={{ height: (items.length - end) * rowHeight }} aria-hidden />
    </div>
  )
}
