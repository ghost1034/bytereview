/**
 * Task dependency helpers — blocked-by / blocking with cycle prevention and critical path.
 */
import { daysBetween } from './time'
import { emitActivity } from './activity'
import { now } from './time'
import { useTasksStore } from '../stores/entities'
import type { Task } from '../types'

/** @returns true if adding blockedById as predecessor of taskId would create a cycle. */
export function wouldCreateCycle(taskId: string, blockedById: string): boolean {
  return wouldCreateDependencyCycle(taskId, blockedById)
}

/** Alias for wouldCreateCycle. */
export function hasCycle(taskId: string, blockedById: string): boolean {
  return wouldCreateCycle(taskId, blockedById)
}

/** @returns true if adding blockedById as predecessor of taskId would create a cycle. */
export function wouldCreateDependencyCycle(taskId: string, blockedById: string): boolean {
  if (taskId === blockedById) return true
  const byId = new Map(useTasksStore.getState().list().map((t) => [t.id, t]))

  const ancestors = new Set<string>()
  const stack = [blockedById]
  while (stack.length) {
    const id = stack.pop()!
    if (id === taskId) return true
    if (ancestors.has(id)) continue
    ancestors.add(id)
    const task = byId.get(id)
    task?.dependencyIds.forEach((dep) => stack.push(dep))
  }
  return false
}

/** Duration in days for critical-path weighting (minimum 1 so undated tasks still count). */
function taskDuration(task: Task): number {
  if (task.startOn && task.dueOn) return Math.max(1, daysBetween(task.startOn, task.dueOn) + 1)
  if (task.dueOn || task.startOn) return 1
  return 1
}

/** @returns task IDs on the longest dependent chain by duration. */
export function computeCriticalPath(tasks: Task[]): Set<string> {
  if (!tasks.length) return new Set()

  const hasDependencies = tasks.some(
    (t) => t.dependencyIds.length > 0 || t.dependentIds.length > 0
  )
  if (!hasDependencies) {
    let bestId = tasks[0].id
    let bestDur = taskDuration(tasks[0])
    tasks.forEach((t) => {
      const d = taskDuration(t)
      if (d > bestDur) {
        bestDur = d
        bestId = t.id
      }
    })
    return new Set([bestId])
  }

  const byId = new Map(tasks.map((t) => [t.id, t]))
  const memo = new Map<string, { total: number; path: string[] }>()

  function longestTo(taskId: string, visiting: Set<string>): { total: number; path: string[] } {
    const cached = memo.get(taskId)
    if (cached) return cached
    if (visiting.has(taskId)) return { total: 0, path: [] }
    visiting.add(taskId)
    const task = byId.get(taskId)
    if (!task) return { total: 0, path: [] }

    let best = { total: taskDuration(task), path: [taskId] }
    task.dependencyIds.forEach((depId) => {
      const sub = longestTo(depId, visiting)
      const total = sub.total + taskDuration(task)
      if (total > best.total) best = { total, path: [...sub.path, taskId] }
    })
    visiting.delete(taskId)
    memo.set(taskId, best)
    return best
  }

  let bestPath: string[] = []
  let bestTotal = -1
  tasks.forEach((t) => {
    const r = longestTo(t.id, new Set())
    if (r.total > bestTotal) {
      bestTotal = r.total
      bestPath = r.path
    }
  })
  return new Set(bestPath)
}

/** Predecessors (blocked-by) for a task. */
export function getBlockedBy(task: Task, tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  return task.dependencyIds.map((id) => byId.get(id)).filter((t): t is Task => Boolean(t))
}

/** Successors (blocking) for a task. */
export function getBlocking(task: Task, tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  return task.dependentIds.map((id) => byId.get(id)).filter((t): t is Task => Boolean(t))
}

/** Add a blocked-by dependency (task depends on predecessor). */
export async function addDependency(
  taskId: string,
  blockedById: string,
  actorId: string
): Promise<{ ok: boolean; error?: string }> {
  if (taskId === blockedById) {
    return { ok: false, error: 'A task cannot depend on itself' }
  }
  if (wouldCreateCycle(taskId, blockedById)) {
    return { ok: false, error: 'This would create a circular dependency' }
  }

  const tasks = useTasksStore.getState()
  const task = tasks.getById(taskId)
  const blocker = tasks.getById(blockedById)
  if (!task || !blocker) return { ok: false, error: 'Task not found' }
  if (task.dependencyIds.includes(blockedById)) return { ok: true }

  await tasks.update(taskId, {
    dependencyIds: [...task.dependencyIds, blockedById],
    modifiedAt: now(),
  })
  await tasks.update(blockedById, {
    dependentIds: [...blocker.dependentIds, taskId],
    modifiedAt: now(),
  })

  emitActivity({
    taskId,
    actorId,
    type: 'dependency_added',
    details: { blockedById },
  })

  return { ok: true }
}

/** Remove a blocked-by dependency. */
export async function removeDependency(
  taskId: string,
  blockedById: string,
  _actorId: string
): Promise<void> {
  const tasks = useTasksStore.getState()
  const task = tasks.getById(taskId)
  const blocker = tasks.getById(blockedById)
  if (!task || !blocker) return

  await tasks.update(taskId, {
    dependencyIds: task.dependencyIds.filter((id) => id !== blockedById),
    modifiedAt: now(),
  })
  await tasks.update(blockedById, {
    dependentIds: blocker.dependentIds.filter((id) => id !== taskId),
    modifiedAt: now(),
  })
}
