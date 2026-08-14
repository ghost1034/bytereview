import {
  DEFAULT_CAPACITY_HOURS_PER_WEEK,
  WORKDAYS_PER_WEEK,
} from './constants'
import { eachDayInRange, isWeekday } from './dateRanges'
import type { TimeBucket } from './buckets'
import type { User, UserTimeOff } from '../../types'
import type { ISODate } from '../../types'

export type UtilizationLevel = 'under' | 'at' | 'over'

/** Weekly capacity with default fallback. */
export function userWeeklyCapacity(user: User | undefined): number {
  return user?.capacityHoursPerWeek ?? DEFAULT_CAPACITY_HOURS_PER_WEEK
}

/** Daily capacity derived from weekly hours. */
export function dailyCapacityHours(user: User | undefined): number {
  return userWeeklyCapacity(user) / WORKDAYS_PER_WEEK
}

/** Capacity budget for a bucket (hours). */
export function bucketCapacityHours(user: User | undefined, bucket: TimeBucket): number {
  const weekly = userWeeklyCapacity(user)
  if (bucket.workdays <= 0) return 0
  if (bucket.start === bucket.end) {
    return isWeekday(bucket.start) ? dailyCapacityHours(user) : 0
  }
  return (weekly / WORKDAYS_PER_WEEK) * bucket.workdays
}

/** True when a date falls inside any time-off block. */
export function isDateOnTimeOff(iso: ISODate, timeOff: UserTimeOff[] | undefined): boolean {
  if (!timeOff?.length) return false
  return timeOff.some((block) => iso >= block.start && iso <= block.end)
}

/** Effective capacity after time-off consumption (0 on full time-off days). */
export function effectiveBucketCapacity(
  user: User | undefined,
  bucket: TimeBucket
): number {
  const base = bucketCapacityHours(user, bucket)
  if (base <= 0) return 0
  const offDays = eachDayInRange(bucket.start, bucket.end).filter(
    (d) => isWeekday(d) && isDateOnTimeOff(d, user?.timeOff)
  ).length
  const daily = dailyCapacityHours(user)
  return Math.max(0, base - offDays * daily)
}

/** Utilization ratio and heatmap level. */
export function utilizationForHours(
  effortHours: number,
  capacityHours: number
): { ratio: number; level: UtilizationLevel } {
  if (capacityHours <= 0) {
    return { ratio: effortHours > 0 ? 2 : 0, level: effortHours > 0 ? 'over' : 'under' }
  }
  const ratio = effortHours / capacityHours
  if (ratio > 1) return { ratio, level: 'over' }
  if (ratio >= 0.7) return { ratio, level: 'at' }
  return { ratio, level: 'under' }
}

/** CSS background for a capacity cell. */
export function cellBackground(level: UtilizationLevel, ratio: number): string {
  if (level === 'over') return 'color-mix(in srgb, hsl(var(--destructive)) 28%, hsl(var(--card)))'
  if (level === 'at') return 'color-mix(in srgb, hsl(var(--warning)) 22%, hsl(var(--card)))'
  const mix = Math.min(24, Math.round(ratio * 30))
  return `color-mix(in srgb, hsl(var(--success)) ${mix}%, hsl(var(--card)))`
}

/** Format hours for display (one decimal when needed). */
export function formatHours(h: number): string {
  if (h === 0) return '0h'
  const rounded = Math.round(h * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded.toFixed(1)}h`
}
