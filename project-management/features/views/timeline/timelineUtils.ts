/**
 * Date ↔ pixel helpers for timeline charts.
 */
import {
  addDays,
  addMonths,
  addQuarters,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  eachDayOfInterval,
  max as maxDate,
  min as minDate,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfYear,
} from 'date-fns'
import type { Task } from '../../../types'
import { toISODate } from '../../../lib/time'
import { PX_PER_UNIT, ROW_H } from './constants'
import type { TaskSpan, ZoomLevel } from './types'

export { ROW_H }

/** Resolve start/end for a task bar (due-only → 1-day bar). */
export function getTaskSpan(task: Task): TaskSpan | null {
  const rawStart = task.startOn ? parseISO(task.startOn) : task.dueOn ? parseISO(task.dueOn) : null
  const rawEnd = task.dueOn ? parseISO(task.dueOn) : task.startOn ? parseISO(task.startOn) : null
  if (!rawStart || !rawEnd) return null
  const start = startOfDay(rawStart)
  const end = startOfDay(rawEnd)
  return start <= end ? { start, end } : { start: end, end: start }
}

/** Snap a date to the grid for the active zoom. */
export function snapDate(date: Date, zoom: ZoomLevel): Date {
  if (zoom === 'day' || zoom === 'week') return startOfDay(date)
  if (zoom === 'month') return startOfMonth(date)
  if (zoom === 'quarter') return startOfQuarter(date)
  return startOfYear(date)
}

function unitDays(zoom: ZoomLevel): number {
  if (zoom === 'day') return 1
  if (zoom === 'week') return 7
  if (zoom === 'month') return 30
  if (zoom === 'quarter') return 91
  return 365
}

/** Units between two dates at the given zoom. */
export function unitsBetween(a: Date, b: Date, zoom: ZoomLevel): number {
  return differenceInCalendarDays(b, a) / unitDays(zoom)
}

/** Pixel X for a date relative to rangeStart. */
export function dateToX(date: Date, rangeStart: Date, zoom: ZoomLevel): number {
  return unitsBetween(rangeStart, startOfDay(date), zoom) * PX_PER_UNIT[zoom]
}

/** Convert pixel X back to a snapped date. */
export function xToDate(x: number, rangeStart: Date, zoom: ZoomLevel): Date {
  const units = x / PX_PER_UNIT[zoom]
  if (zoom === 'day') return snapDate(addDays(rangeStart, Math.round(units)), zoom)
  if (zoom === 'week') return snapDate(addWeeks(rangeStart, Math.round(units)), zoom)
  if (zoom === 'month') return snapDate(addMonths(rangeStart, Math.round(units)), zoom)
  if (zoom === 'quarter') return snapDate(addQuarters(rangeStart, Math.round(units)), zoom)
  return snapDate(addYears(rangeStart, Math.round(units)), zoom)
}

/** Chart width in pixels for the visible range. */
export function chartWidth(rangeStart: Date, rangeEnd: Date, zoom: ZoomLevel): number {
  return Math.max(1, unitsBetween(rangeStart, rangeEnd, zoom)) * PX_PER_UNIT[zoom]
}

/** Compute default visible date range from tasks. */
export function defaultRange(tasks: Task[]): { start: Date; end: Date } {
  const today = startOfDay(new Date())
  let start = addDays(today, -14)
  let end = addDays(today, 42)
  tasks.forEach((t) => {
    const span = getTaskSpan(t)
    if (!span) return
    start = minDate([start, span.start])
    end = maxDate([end, span.end])
  })
  return { start: addDays(start, -7), end: addDays(end, 14) }
}

/** Day columns for weekend shading (day zoom only). */
export function weekendColumns(rangeStart: Date, rangeEnd: Date): Date[] {
  return eachDayOfInterval({ start: rangeStart, end: rangeEnd }).filter(
    (d) => d.getDay() === 0 || d.getDay() === 6
  )
}

/** Patch task dates from a span. */
export function spanToIso(span: TaskSpan): { startOn: string; dueOn: string } {
  return { startOn: toISODate(span.start), dueOn: toISODate(span.end) }
}

/** True when bar intersects the horizontal viewport. */
export function isBarVisible(left: number, width: number, scrollLeft: number, viewportW: number): boolean {
  const right = left + width
  return right >= scrollLeft - 40 && left <= scrollLeft + viewportW + 40
}
