'use client'

import { useCallback, useEffect, useRef } from 'react'
import { clampSidebarWidth } from '../../stores/auth'

type Props = {
  width: number
  collapsed: boolean
  onWidthChange: (width: number) => void
}

export function SidebarResizeHandle({ width, collapsed, onWidthChange }: Props) {
  const dragging = useRef(false)
  const sidebarLeft = useRef(0)

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (collapsed) return
      e.preventDefault()
      dragging.current = true
      sidebarLeft.current = e.currentTarget.parentElement?.getBoundingClientRect().left ?? 0
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [collapsed]
  )

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return
      onWidthChange(clampSidebarWidth(e.clientX - sidebarLeft.current))
    }
    const onUp = () => {
      dragging.current = false
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [onWidthChange])

  if (collapsed) return null

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-label="Resize sidebar"
      onPointerDown={onPointerDown}
      className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize touch-none hover:bg-[hsl(var(--primary))]/30"
    />
  )
}
