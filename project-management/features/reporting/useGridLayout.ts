'use client'

/** 12-column grid layout engine with drag + resize persistence. */
import { useCallback, useRef, useState } from 'react'
import type { Dashboard } from '../../types'

export const GRID_COLS = 12
export const ROW_HEIGHT = 72

type LayoutItem = Dashboard['layout'][number]

type Options = {
  layout: LayoutItem[]
  onChange: (next: LayoutItem[]) => void
}

/** Manage draggable/resizable dashboard chart tiles. */
export function useGridLayout({ layout, onChange }: Options) {
  const [dragId, setDragId] = useState<string | null>(null)
  const dragMode = useRef<'move' | 'resize'>('move')
  const dragOrigin = useRef<{ x: number; y: number; item: LayoutItem } | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

  const updateItem = useCallback(
    (chartId: string, patch: Partial<LayoutItem>) => {
      onChange(layout.map((l) => (l.chartId === chartId ? { ...l, ...patch } : l)))
    },
    [layout, onChange]
  )

  const onDragStart = (item: LayoutItem, clientX: number, clientY: number) => {
    dragMode.current = 'move'
    setDragId(item.chartId)
    dragOrigin.current = { x: clientX, y: clientY, item: { ...item } }
  }

  const onDragMove = (clientX: number, clientY: number) => {
    const origin = dragOrigin.current
    const grid = gridRef.current
    if (!origin || !grid) return
    const colWidth = grid.clientWidth / GRID_COLS
    const dx = Math.round((clientX - origin.x) / colWidth)
    const dy = Math.round((clientY - origin.y) / ROW_HEIGHT)
    updateItem(origin.item.chartId, {
      x: clamp(origin.item.x + dx, 0, GRID_COLS - origin.item.w),
      y: Math.max(0, origin.item.y + dy),
    })
  }

  const onDragEnd = () => {
    setDragId(null)
    dragOrigin.current = null
  }

  const onResizeStart = (item: LayoutItem, clientX: number, clientY: number) => {
    dragMode.current = 'resize'
    dragOrigin.current = { x: clientX, y: clientY, item: { ...item } }
    setDragId(item.chartId)
  }

  const onResizeMove = (clientX: number, clientY: number) => {
    const origin = dragOrigin.current
    const grid = gridRef.current
    if (!origin || !grid) return
    const colWidth = grid.clientWidth / GRID_COLS
    const dw = Math.round((clientX - origin.x) / colWidth)
    const dh = Math.round((clientY - origin.y) / ROW_HEIGHT)
    updateItem(origin.item.chartId, {
      w: clamp(origin.item.w + dw, 2, GRID_COLS - origin.item.x),
      h: clamp(origin.item.h + dh, 2, 12),
    })
  }

  const onPointerMove = (clientX: number, clientY: number) => {
    if (dragMode.current === 'resize') onResizeMove(clientX, clientY)
    else onDragMove(clientX, clientY)
  }

  return { gridRef, dragId, onDragStart, onDragEnd, onResizeStart, onPointerMove }
}
