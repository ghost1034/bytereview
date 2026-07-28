import { addDays, addWeeks, format } from 'date-fns'
import { eachDayInRange, isWeekday, monthBucketKey, weekBucketKey } from './dateRanges'
import type { ISODate } from '../../types'

export type TimeScale = 'day' | 'week' | 'month'

export type TimeBucket = {
  key: string
  label: string
  start: ISODate
  end: ISODate
  workdays: number
}

const WEEK_OPTS = { weekStartsOn: 1 as const }

/** Build column buckets for the visible range and scale. */
export function buildTimeBuckets(start: ISODate, end: ISODate, scale: TimeScale): TimeBucket[] {
  if (scale === 'day') {
    return eachDayInRange(start, end).map((day) => ({
      key: day,
      label: format(new Date(day), 'EEE d'),
      start: day,
      end: day,
      workdays: isWeekday(day) ? 1 : 0,
    }))
  }
  if (scale === 'week') {
    const seen = new Map<string, TimeBucket>()
    eachDayInRange(start, end).forEach((day) => {
      const key = weekBucketKey(day)
      if (seen.has(key)) return
      const weekStart = new Date(key)
      const weekEnd = addDays(addWeeks(weekStart, 1), -1)
      const days = eachDayInRange(key, toIso(weekEnd)).filter((d) => d >= start && d <= end)
      seen.set(key, {
        key,
        label: `Wk ${format(weekStart, 'MMM d')}`,
        start: days[0] ?? key,
        end: days[days.length - 1] ?? key,
        workdays: days.filter(isWeekday).length,
      })
    })
    return [...seen.values()]
  }
  const seen = new Map<string, TimeBucket>()
  eachDayInRange(start, end).forEach((day) => {
    const key = monthBucketKey(day)
    if (seen.has(key)) return
    const monthStart = new Date(key)
    seen.set(key, {
      key,
      label: format(monthStart, 'MMM yyyy'),
      start: key,
      end: toIso(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)),
      workdays: eachDayInRange(key, toIso(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)))
        .filter((d) => d >= start && d <= end && isWeekday(d)).length,
    })
  })
  return [...seen.values()]
}

function toIso(d: Date): ISODate {
  return format(d, 'yyyy-MM-dd')
}

/** Map a calendar day to a bucket key for the active scale. */
export function bucketKeyForDay(day: ISODate, scale: TimeScale): string {
  if (scale === 'day') return day
  if (scale === 'week') return weekBucketKey(day)
  return monthBucketKey(day)
}

/** Representative due date when dropping a task onto a bucket (reschedule). */
export function defaultDueForBucket(bucket: TimeBucket): ISODate {
  if (bucket.workdays > 0) {
    const weekday = eachDayInRange(bucket.start, bucket.end).find(isWeekday)
    if (weekday) return weekday
  }
  return bucket.start
}
