import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { Project, Task } from '../../../types'

export type CalendarMode = 'month' | 'week'

export type SpanPlacement = {
  task: Task
  startCol: number
  span: number
  row: number
  continuesLeft: boolean
  continuesRight: boolean
}

/** ISO date key (yyyy-MM-dd). */
export function dateKey(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function parseDateKey(key: string): Date {
  return parseISO(key)
}

export function isWeekend(d: Date): boolean {
  const day = d.getDay()
  return day === 0 || day === 6
}

/** Tasks due on a single day (excludes multi-day spans handled separately). */
export function singleDayTasks(tasks: Task[], key: string): Task[] {
  return tasks.filter((t) => {
    if (!t.dueOn) return false
    const due = t.dueOn.slice(0, 10)
    const start = t.startOn?.slice(0, 10)
    if (start && start !== due) return false
    return due === key
  })
}

/** True when task spans multiple calendar days. */
export function isMultiDayTask(task: Task): boolean {
  if (!task.dueOn) return false
  const start = task.startOn?.slice(0, 10) ?? task.dueOn.slice(0, 10)
  const end = task.dueOn.slice(0, 10)
  return start !== end
}

/** Reschedule task preserving multi-day span length. */
export function buildDatePatch(task: Task, targetKey: string): Partial<Task> {
  const due = task.dueOn?.slice(0, 10)
  const start = task.startOn?.slice(0, 10)
  if (!due) return { dueOn: targetKey }
  if (start && start !== due) {
    const span = differenceInCalendarDays(parseISO(due), parseISO(start))
    const newEnd = targetKey
    const newStart = format(addDays(parseISO(targetKey), -span), 'yyyy-MM-dd')
    return { startOn: newStart, dueOn: newEnd }
  }
  return { dueOn: targetKey }
}

/** Build range patch when dragging across two days. */
export function buildRangePatch(startKey: string, endKey: string): Partial<Task> {
  const a = startKey <= endKey ? startKey : endKey
  const b = startKey <= endKey ? endKey : startKey
  if (a === b) return { dueOn: a, startOn: undefined }
  return { startOn: a, dueOn: b }
}

/** Count tasks touching a day (single + multi-day). */
export function taskCountOnDay(tasks: Task[], key: string): number {
  return tasks.filter((t) => taskTouchesDay(t, key)).length
}

export function taskTouchesDay(task: Task, key: string): boolean {
  if (!task.dueOn) return false
  const end = task.dueOn.slice(0, 10)
  const start = task.startOn?.slice(0, 10) ?? end
  return key >= start && key <= end
}

/** Lay out multi-day bars for a week row. */
export function layoutMultiDayBars(
  tasks: Task[],
  rowDays: Date[],
  rowIndex: number
): SpanPlacement[] {
  const rowStart = dateKey(rowDays[0])
  const rowEnd = dateKey(rowDays[6])
  const placements: SpanPlacement[] = []

  tasks.filter(isMultiDayTask).forEach((task) => {
    const start = task.startOn?.slice(0, 10) ?? task.dueOn!.slice(0, 10)
    const end = task.dueOn!.slice(0, 10)
    if (end < rowStart || start > rowEnd) return

    const visibleStart = start < rowStart ? rowStart : start
    const visibleEnd = end > rowEnd ? rowEnd : end
    const startCol = rowDays.findIndex((d) => dateKey(d) === visibleStart)
    const endCol = rowDays.findIndex((d) => dateKey(d) === visibleEnd)
    if (startCol < 0 || endCol < 0) return

    placements.push({
      task,
      startCol,
      span: endCol - startCol + 1,
      row: rowIndex,
      continuesLeft: start < rowStart,
      continuesRight: end > rowEnd,
    })
  })

  return placements
}

/** Chip accent color from project. */
export function chipColor(project: Project): string {
  return project.color || 'hsl(var(--primary))'
}
