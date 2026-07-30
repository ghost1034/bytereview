'use client'

/**
 * ListVirtualScroll — hand-rolled windowed renderer for large row lists.
 */
import { useCallback, useEffect, useState, type ReactNode, type RefObject } from 'react'
import { LIST_ROW_HEIGHT, LIST_VIRTUALIZE_THRESHOLD } from './listTypes'

type Props = {
  rowCount: number
  scrollRef: RefObject<HTMLDivElement | null>
  renderRow: (index: number) => ReactNode
  enabled?: boolean
}

/** Renders only visible rows when count exceeds threshold. */
export function ListVirtualScroll({ rowCount, scrollRef, renderRow, enabled = true }: Props) {
  const [range, setRange] = useState({ start: 0, end: 40 })

  const recompute = useCallback(() => {
    const el = scrollRef.current
    if (!el || !enabled || rowCount <= LIST_VIRTUALIZE_THRESHOLD) {
      setRange({ start: 0, end: rowCount })
      return
    }
    const scrollTop = el.scrollTop
    const viewHeight = el.clientHeight
    const overscan = 8
    const start = Math.max(0, Math.floor(scrollTop / LIST_ROW_HEIGHT) - overscan)
    const visible = Math.ceil(viewHeight / LIST_ROW_HEIGHT) + overscan * 2
    const end = Math.min(rowCount, start + visible)
    setRange({ start, end })
  }, [enabled, rowCount, scrollRef])

  useEffect(() => {
    recompute()
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', recompute, { passive: true })
    window.addEventListener('resize', recompute)
    return () => {
      el.removeEventListener('scroll', recompute)
      window.removeEventListener('resize', recompute)
    }
  }, [recompute, scrollRef])

  if (!enabled || rowCount <= LIST_VIRTUALIZE_THRESHOLD) {
    return <>{Array.from({ length: rowCount }, (_, i) => renderRow(i))}</>
  }

  const topPad = range.start * LIST_ROW_HEIGHT
  const bottomPad = (rowCount - range.end) * LIST_ROW_HEIGHT

  return (
    <div style={{ minHeight: rowCount * LIST_ROW_HEIGHT }}>
      <div style={{ height: topPad }} aria-hidden />
      {Array.from({ length: range.end - range.start }, (_, i) => renderRow(range.start + i))}
      <div style={{ height: bottomPad }} aria-hidden />
    </div>
  )
}
