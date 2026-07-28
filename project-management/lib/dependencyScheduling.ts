/**
 * Finish-to-start scheduling — shift dependents when predecessors move.
 */
import { addDays, differenceInCalendarDays, startOfDay } from 'date-fns'
import { getTaskSpan, snapDate } from '../features/views/timeline/timelineUtils'
import type { ZoomLevel } from '../features/views/timeline/types'
import { PX_PER_UNIT } from '../features/views/timeline/constants'
import { setDue } from './taskActions'
import { toISODate } from './time'
import { useTasksStore } from '../stores/entities'
import type { Task } from '../types'

function unitDays(zoom: ZoomLevel): number {
  if (zoom === 'day') return 1
  if (zoom === 'week') return 7
  if (zoom === 'month') return 30
  if (zoom === 'quarter') return 91
  return 365
}

function taskEndDate(task: Task): Date | null {
  return getTaskSpan(task)?.end ?? null
}

/** Delta days the task end moved during a drag. */
export function dragEndDeltaDays(
  startX: number,
  clientX: number,
  origEnd: Date,
  mode: 'move' | 'resize-end',
  zoom: ZoomLevel
): number {
  const pxPerDay = PX_PER_UNIT[zoom] / unitDays(zoom)
  const deltaDays = Math.round((clientX - startX) / pxPerDay)
  const newEnd = snapDate(addDays(origEnd, deltaDays), zoom)
  return differenceInCalendarDays(newEnd, origEnd)
}

/** Shift direct and transitive dependents forward by deltaDays. */
export async function shiftDependentsChain(
  predecessorId: string,
  deltaDays: number,
  actorId: string,
  tasks?: Task[]
): Promise<void> {
  if (deltaDays <= 0) return
  const list = tasks ?? useTasksStore.getState().list()
  const dependents = list.filter((t) => t.dependencyIds.includes(predecessorId))
  await Promise.all(
    dependents.map(async (dep) => {
      const span = getTaskSpan(dep)
      if (!span) return
      await setDue(
        dep.id,
        {
          startOn: toISODate(addDays(span.start, deltaDays)),
          dueOn: toISODate(addDays(span.end, deltaDays)),
        },
        actorId
      )
      await shiftDependentsChain(dep.id, deltaDays, actorId)
    })
  )
}

/**
 * Align dependents to start after their latest predecessor ends (finish-to-start).
 * @returns number of tasks shifted.
 */
export async function enforceDependentScheduling(tasks: Task[], actorId: string): Promise<number> {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  let shifted = 0
  let changed = true

  while (changed) {
    changed = false
    for (const id of tasks.map((t) => t.id)) {
      const fresh = useTasksStore.getState().getById(id)
      if (fresh) byId.set(id, fresh)
    }

    for (const task of tasks) {
      const current = byId.get(task.id)
      if (!current?.dependencyIds.length) continue
      const span = getTaskSpan(current)
      if (!span) continue

      let latestEnd: Date | null = null
      for (const depId of current.dependencyIds) {
        const pred = byId.get(depId)
        if (!pred) continue
        const end = taskEndDate(pred)
        if (!end) continue
        if (!latestEnd || end > latestEnd) latestEnd = end
      }
      if (!latestEnd) continue

      const minStart = addDays(latestEnd, 1)
      if (span.start >= startOfDay(minStart)) continue

      const duration = differenceInCalendarDays(span.end, span.start)
      const newStart = startOfDay(minStart)
      const newEnd = addDays(newStart, Math.max(0, duration))

      await setDue(
        current.id,
        { startOn: toISODate(newStart), dueOn: toISODate(newEnd) },
        actorId
      )
      shifted += 1
      changed = true

      const updated = useTasksStore.getState().getById(current.id)
      if (updated) byId.set(current.id, updated)
    }
  }

  return shifted
}

/** Count dependents that start before their latest predecessor ends. */
export function countSchedulingConflicts(tasks: Task[]): number {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  let conflicts = 0
  for (const task of tasks) {
    if (!task.dependencyIds.length) continue
    const span = getTaskSpan(task)
    if (!span) continue
    let latestEnd: Date | null = null
    for (const depId of task.dependencyIds) {
      const pred = byId.get(depId)
      if (!pred) continue
      const end = taskEndDate(pred)
      if (!end) continue
      if (!latestEnd || end > latestEnd) latestEnd = end
    }
    if (!latestEnd) continue
    if (span.start < startOfDay(addDays(latestEnd, 1))) conflicts += 1
  }
  return conflicts
}
