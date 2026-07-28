import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { toISODate } from '../time'
import type { ISODate } from '../../types'

export type WorkloadPreset = 'this_week' | 'next_week' | 'this_month' | 'custom'

export type WorkloadDateRange = {
  preset: WorkloadPreset
  start: ISODate
  end: ISODate
}

const WEEK_OPTS = { weekStartsOn: 1 as const }

/** Resolve a preset or custom range into inclusive ISO start/end dates. */
export function resolveDateRange(
  preset: WorkloadPreset,
  customStart?: ISODate,
  customEnd?: ISODate
): WorkloadDateRange {
  const today = new Date()
  if (preset === 'this_week') {
    const start = startOfWeek(today, WEEK_OPTS)
    const end = endOfWeek(today, WEEK_OPTS)
    return { preset, start: toISODate(start), end: toISODate(end) }
  }
  if (preset === 'next_week') {
    const next = addWeeks(today, 1)
    const start = startOfWeek(next, WEEK_OPTS)
    const end = endOfWeek(next, WEEK_OPTS)
    return { preset, start: toISODate(start), end: toISODate(end) }
  }
  if (preset === 'this_month') {
    const start = startOfMonth(today)
    const end = endOfMonth(today)
    return { preset, start: toISODate(start), end: toISODate(end) }
  }
  const start = customStart ?? toISODate(today)
  const end = customEnd ?? toISODate(addDays(new Date(start), 13))
  return { preset: 'custom', start, end: start <= end ? end : start }
}

/** Enumerate each calendar day in an inclusive ISO range. */
export function eachDayInRange(start: ISODate, end: ISODate): ISODate[] {
  const days: ISODate[] = []
  let cursor = new Date(start)
  const last = new Date(end)
  while (cursor <= last) {
    days.push(toISODate(cursor))
    cursor = addDays(cursor, 1)
  }
  return days
}

/** True when the date falls on Mon–Fri. */
export function isWeekday(iso: ISODate): boolean {
  const d = new Date(iso).getDay()
  return d >= 1 && d <= 5
}

/** Week bucket key (Monday ISO) containing the given date. */
export function weekBucketKey(iso: ISODate): ISODate {
  return toISODate(startOfWeek(new Date(iso), WEEK_OPTS))
}

/** Month bucket key YYYY-MM-01. */
export function monthBucketKey(iso: ISODate): ISODate {
  return toISODate(startOfMonth(new Date(iso)))
}

/** Count weekdays between two inclusive ISO dates. */
export function countWeekdays(start: ISODate, end: ISODate): number {
  return eachDayInRange(start, end).filter(isWeekday).length
}
