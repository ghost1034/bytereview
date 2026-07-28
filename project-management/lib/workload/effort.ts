import { daysBetween } from '../time'
import {
  DEFAULT_RANGE_EFFORT_HOURS,
  DEFAULT_SINGLE_DAY_EFFORT_HOURS,
} from './constants'
import { eachDayInRange, isWeekday } from './dateRanges'
import type { CustomField, Task } from '../../types'
import type { ISODate } from '../../types'

/** Find a numeric Estimate custom field id in the workspace. */
export function findEstimateFieldId(fields: CustomField[]): string | undefined {
  return fields.find(
    (f) =>
      f.type === 'number' &&
      /^estimate(\s*\(h\))?$/i.test(f.name.trim())
  )?.id
}

/** Resolve total effort hours for a task using effort, Estimate field, or defaults. */
export function resolveTaskEffortHours(
  task: Task,
  estimateFieldId?: string,
  effortFieldId?: string
): number {
  if (task.effort?.value != null && task.effort.value > 0) {
    return task.effort.unit === 'points' ? task.effort.value : task.effort.value
  }
  if (effortFieldId) {
    const val = task.customFieldValues[effortFieldId]
    if (val?.type === 'number' && val.value != null && val.value > 0) return val.value
  }
  if (estimateFieldId) {
    const val = task.customFieldValues[estimateFieldId]
    if (val?.type === 'number' && val.value != null && val.value > 0) return val.value
  }
  if (task.completed) return 0
  const start = task.startOn
  const due = task.dueOn
  if (start && due && start !== due) return DEFAULT_RANGE_EFFORT_HOURS
  if (due || start) return DEFAULT_SINGLE_DAY_EFFORT_HOURS
  return DEFAULT_SINGLE_DAY_EFFORT_HOURS
}

/** Distribute task effort evenly across weekdays in its date span. */
export function distributeTaskEffortByDay(
  task: Task,
  estimateFieldId?: string,
  effortFieldId?: string
): Map<ISODate, number> {
  const total = resolveTaskEffortHours(task, estimateFieldId, effortFieldId)
  const map = new Map<ISODate, number>()
  if (total <= 0) return map

  const start = task.startOn ?? task.dueOn
  const end = task.dueOn ?? task.startOn
  if (!start && !end) return map

  if (!task.startOn && task.dueOn) {
    map.set(task.dueOn, total)
    return map
  }

  const spanStart = start!
  const spanEnd = end ?? spanStart
  const weekdays = eachDayInRange(spanStart, spanEnd).filter(isWeekday)
  if (weekdays.length === 0) {
    map.set(spanEnd, total)
    return map
  }
  const perDay = total / weekdays.length
  weekdays.forEach((d) => map.set(d, (map.get(d) ?? 0) + perDay))
  return map
}

/** Whether a task overlaps a visible inclusive date range. */
export function taskOverlapsRange(task: Task, rangeStart: ISODate, rangeEnd: ISODate): boolean {
  const start = task.startOn ?? task.dueOn
  const end = task.dueOn ?? task.startOn
  if (!start && !end) return true
  const tStart = start ?? end!
  const tEnd = end ?? start!
  return tStart <= rangeEnd && tEnd >= rangeStart
}

/** Span length in calendar days (for default effort heuristic). */
export function taskSpanDays(task: Task): number {
  if (task.startOn && task.dueOn) return Math.max(1, daysBetween(task.startOn, task.dueOn) + 1)
  return 1
}
