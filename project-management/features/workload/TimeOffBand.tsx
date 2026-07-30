'use client'

/** Gray hatched overlay for scheduled time off. */
import { eachDayInRange } from '../../lib/workload/dateRanges'
import { isDateOnTimeOff } from '../../lib/workload/utilization'
import type { TimeBucket } from '../../lib/workload/buckets'
import type { UserTimeOff } from '../../types'

type Props = {
  bucket: TimeBucket
  timeOff?: UserTimeOff[]
}

/** Returns true when any weekday in the bucket is time off. */
export function bucketHasTimeOff(bucket: TimeBucket, timeOff?: UserTimeOff[]): boolean {
  if (!timeOff?.length) return false
  return eachDayInRange(bucket.start, bucket.end).some((d) => isDateOnTimeOff(d, timeOff))
}

/** Inline label for time-off blocks (used in row summary). */
export function TimeOffBand({ bucket, timeOff }: Props) {
  if (!bucketHasTimeOff(bucket, timeOff)) return null
  return (
    <span
      className="ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
      style={{
        background: 'repeating-linear-gradient(135deg, var(--bg-muted) 0 4px, var(--border-subtle) 4px 8px)',
        color: 'var(--ink-muted)',
      }}
    >
      Time off
    </span>
  )
}
