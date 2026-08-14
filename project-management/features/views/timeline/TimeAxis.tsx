'use client'

/**
 * Two-row time axis with coarse + fine bands and pan/zoom wheel support.
 */
import { useMemo } from 'react'
import { isWeekend } from 'date-fns'
import { HEADER_H, PX_PER_UNIT } from './constants'
import { axisTicks, coarseLabel, fineLabel } from './axisUtils'
import { dateToX } from './timelineUtils'
import type { ZoomLevel } from './types'

type Props = {
  rangeStart: Date
  rangeEnd: Date
  zoom: ZoomLevel
  todayX: number
  onPanStart: (clientX: number) => void
  onWheelZoom: (deltaY: number, ctrlKey: boolean) => void
}

export function TimeAxis({ rangeStart, rangeEnd, zoom, todayX, onPanStart, onWheelZoom }: Props) {
  const ticks = useMemo(() => axisTicks(rangeStart, rangeEnd, zoom), [rangeEnd, rangeStart, zoom])
  const width = dateToX(rangeEnd, rangeStart, zoom) + PX_PER_UNIT[zoom]

  return (
    <div
      className="relative border-b select-none"
      style={{ height: HEADER_H, borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-muted))' }}
      onPointerDown={(e) => {
        if (e.button === 0) onPanStart(e.clientX)
      }}
      onWheel={(e) => {
        e.preventDefault()
        onWheelZoom(e.deltaY, e.ctrlKey || e.metaKey)
      }}
    >
      {ticks.map((tick) => {
        const left = dateToX(tick, rangeStart, zoom)
        const w = PX_PER_UNIT[zoom]
        const weekend = zoom === 'day' && isWeekend(tick)
        return (
          <div
            key={tick.toISOString()}
            className="absolute top-0 flex flex-col border-r"
            style={{
              left,
              width: w,
              height: HEADER_H,
              borderColor: 'hsl(var(--border))',
              background: weekend ? 'hsl(var(--surface-muted))' : undefined,
            }}
          >
            <span className="truncate px-1 pt-1 text-[9px] font-medium" style={{ color: 'hsl(var(--foreground-muted))' }}>
              {coarseLabel(tick, zoom)}
            </span>
            <span className="truncate px-1 text-[10px] font-semibold" style={{ color: 'hsl(var(--foreground-muted))' }}>
              {fineLabel(tick, zoom)}
            </span>
          </div>
        )
      })}
      <div
        className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5"
        style={{ left: todayX, background: 'hsl(var(--primary))' }}
      >
        <span
          className="absolute -top-0 left-1 rounded px-1 text-[9px] font-semibold"
          style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
        >
          Today
        </span>
      </div>
    </div>
  )
}
