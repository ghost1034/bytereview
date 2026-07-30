/**
 * Due-date bucket keys shared by filters and grouping.
 */
import { differenceInCalendarDays, endOfWeek, isWithinInterval, startOfDay, startOfWeek } from 'date-fns'
import type { Task } from '../../types'

/** Compute the due-date bucket key for a task. */
export function dueBucket(task: Task): string | null {
  if (!task.dueOn) return null
  const due = startOfDay(new Date(task.dueOn))
  const today = startOfDay(new Date())
  const diff = differenceInCalendarDays(due, today)
  if (diff < 0) return '__overdue__'
  if (diff === 0) return '__today__'
  if (diff === 1) return '__tomorrow__'
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 })
  if (isWithinInterval(due, { start: weekStart, end: weekEnd })) return '__this_week__'
  const nextWeekStart = new Date(weekEnd)
  nextWeekStart.setDate(nextWeekStart.getDate() + 1)
  const nextWeekEnd = endOfWeek(nextWeekStart, { weekStartsOn: 1 })
  if (isWithinInterval(due, { start: nextWeekStart, end: nextWeekEnd })) return '__next_week__'
  return '__later__'
}
