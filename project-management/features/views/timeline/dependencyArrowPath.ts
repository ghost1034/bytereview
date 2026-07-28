/**
 * Finish-to-start dependency arrow geometry aligned to task bar edges.
 */
import { differenceInCalendarDays } from 'date-fns'
import type { Task } from '../../../types'
import { PX_PER_UNIT, ROW_H } from './constants'
import { getTaskSpan } from './timelineUtils'
import type { ZoomLevel } from './types'

function unitDays(zoom: ZoomLevel): number {
  if (zoom === 'day') return 1
  if (zoom === 'week') return 7
  if (zoom === 'month') return 30
  if (zoom === 'quarter') return 91
  return 365
}

/** Pixel anchors matching TaskBar / barGeometry layout. */
export function taskBarAnchors(
  task: Task,
  rangeStart: Date,
  zoom: ZoomLevel
): { left: number; right: number } | null {
  const span = getTaskSpan(task)
  if (!span) return null
  const ud = unitDays(zoom)
  const px = PX_PER_UNIT[zoom]
  const left = (differenceInCalendarDays(span.start, rangeStart) / ud) * px + 2
  const days = differenceInCalendarDays(span.end, span.start) + 1
  const width = Math.max((days / ud) * px - 4, px * 0.35)
  return { left, right: left + width }
}

export type DependencyArrowGeom = {
  path: string
  /** Dependent starts before predecessor finishes — needs reschedule. */
  conflict: boolean
}

const ROUTE_GUTTER = 10

/**
 * Orthogonal finish-to-start connector from predecessor bar end → dependent bar start.
 * Avoids cubic curves that can look like stray strokes on the dependent bar.
 */
export function buildDependencyArrowPath(
  from: Task,
  to: Task,
  fromRow: number,
  toRow: number,
  rangeStart: Date,
  zoom: ZoomLevel
): DependencyArrowGeom | null {
  const fromBar = taskBarAnchors(from, rangeStart, zoom)
  const toBar = taskBarAnchors(to, rangeStart, zoom)
  if (!fromBar || !toBar) return null

  const x1 = fromBar.right
  const x2 = toBar.left
  const y1 = fromRow * ROW_H + ROW_H / 2
  const y2 = toRow * ROW_H + ROW_H / 2
  const conflict = x2 < x1 + 4

  if (Math.abs(y1 - y2) < 1) {
    return {
      path: `M ${x1} ${y1} L ${x2} ${y2}`,
      conflict,
    }
  }

  if (conflict) {
    const routeX = Math.max(x1, x2) + ROUTE_GUTTER + 12
    return {
      path: `M ${x1} ${y1} L ${routeX} ${y1} L ${routeX} ${y2} L ${x2} ${y2}`,
      conflict: true,
    }
  }

  const midX = x1 + Math.max(ROUTE_GUTTER, (x2 - x1) / 2)
  return {
    path: `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`,
    conflict: false,
  }
}
