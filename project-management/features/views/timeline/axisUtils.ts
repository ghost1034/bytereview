/**
 * Time axis tick and label helpers.
 */
import {
  addDays,
  addMonths,
  addQuarters,
  addWeeks,
  addYears,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  format,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
} from 'date-fns'
import type { ZoomLevel } from './types'

export function coarseLabel(date: Date, zoom: ZoomLevel): string {
  if (zoom === 'day' || zoom === 'week') return format(date, 'MMMM yyyy')
  return format(date, 'yyyy')
}

export function fineLabel(date: Date, zoom: ZoomLevel): string {
  if (zoom === 'day') return format(date, 'd')
  if (zoom === 'week') return `W${format(date, 'w')}`
  if (zoom === 'month') return format(date, 'MMM')
  if (zoom === 'quarter') return `Q${format(date, 'Q')}`
  return format(date, 'yyyy')
}

/** Iterate axis tick dates for the range. */
export function axisTicks(rangeStart: Date, rangeEnd: Date, zoom: ZoomLevel): Date[] {
  const ticks: Date[] = []
  let cur =
    zoom === 'day'
      ? startOfDay(rangeStart)
      : zoom === 'week'
        ? startOfWeek(rangeStart)
        : zoom === 'month'
          ? startOfMonth(rangeStart)
          : zoom === 'quarter'
            ? startOfQuarter(rangeStart)
            : startOfYear(rangeStart)

  const end =
    zoom === 'day'
      ? rangeEnd
      : zoom === 'week'
        ? endOfWeek(rangeEnd)
        : zoom === 'month'
          ? endOfMonth(rangeEnd)
          : zoom === 'quarter'
            ? endOfQuarter(rangeEnd)
            : endOfYear(rangeEnd)

  while (cur <= end) {
    ticks.push(cur)
    if (zoom === 'day') cur = addDays(cur, 1)
    else if (zoom === 'week') cur = addWeeks(cur, 1)
    else if (zoom === 'month') cur = addMonths(cur, 1)
    else if (zoom === 'quarter') cur = addQuarters(cur, 1)
    else cur = addYears(cur, 1)
  }
  return ticks
}
