/** Dashboard schedule calculation. Execution belongs to the server job pipeline. */
import { addDays, addMonths, nextMonday, setDate, startOfDay } from 'date-fns'
import type { DashboardSchedule } from './types'

/** Compute next run from frequency anchor. */
export function nextRunForFrequency(frequency: DashboardSchedule['frequency'], from = new Date()): string {
  const base = startOfDay(from)
  if (frequency === 'daily') return addDays(base, 1).toISOString()
  if (frequency === 'weekly_mon') return nextMonday(base).toISOString()
  const nextMonth = addMonths(base, 1)
  return setDate(nextMonth, 1).toISOString()
}
