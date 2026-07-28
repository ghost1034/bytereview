/**
 * Pure subtask hierarchy helpers — depth, ancestry, progress, reparent validation.
 */
import type { Task } from '../types'

/** Max nesting depth (root task = level 1). */
export const MAX_DEPTH = 5

const INDENT_PX = 16

/** Horizontal indent per depth level for subtask rows. */
export const SUBTASK_INDENT_PX = INDENT_PX

function byIdMap(allTasks: Task[]): Map<string, Task> {
  return new Map(allTasks.map((t) => [t.id, t]))
}

/** Direct child tasks of parentId, sorted by name. */
export function getChildren(parentId: string, allTasks: Task[]): Task[] {
  return allTasks.filter((t) => t.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name))
}

/** Depth from root (no parent = 1). */
export function getSubtaskDepth(task: Task, allTasks: Task[]): number {
  const byId = byIdMap(allTasks)
  let depth = 1
  let current: Task | undefined = task
  while (current?.parentId) {
    depth += 1
    current = byId.get(current.parentId)
  }
  return depth
}

/** Whether a new subtask may be created under parentId. */
export function canAddSubtask(parentId: string, allTasks: Task[]): boolean {
  const parent = allTasks.find((t) => t.id === parentId)
  if (!parent) return false
  return getSubtaskDepth(parent, allTasks) < MAX_DEPTH
}

/** Asana-style separator row (name ends with colon). */
export function isRenderedAsSeparator(task: Task): boolean {
  return task.resourceSubtype === 'default_task' && task.name.trimEnd().endsWith(':')
}

/** Count completed vs total descendant tasks (excludes separators). */
export function getSubtaskProgress(
  taskId: string,
  allTasks: Task[]
): { done: number; total: number } {
  const descendants = flattenSubtree(taskId, allTasks).filter((t) => t.id !== taskId)
  const actionable = descendants.filter((t) => !isRenderedAsSeparator(t))
  return {
    done: actionable.filter((t) => t.completed).length,
    total: actionable.length,
  }
}

/** Direct-child counts for expand chevrons and rollups. */
export function getSubtaskCounts(
  taskId: string,
  allTasks: Task[]
): { num_subtasks: number; num_open_subtasks: number } {
  const children = getChildren(taskId, allTasks).filter((t) => !isRenderedAsSeparator(t))
  return {
    num_subtasks: children.length,
    num_open_subtasks: children.filter((t) => !t.completed).length,
  }
}

/** Ancestors from root to parent (excludes taskId). */
export function getAncestors(taskId: string, allTasks: Task[]): Task[] {
  const byId = byIdMap(allTasks)
  const chain: Task[] = []
  let current = byId.get(taskId)
  while (current?.parentId) {
    const parent = byId.get(current.parentId)
    if (!parent) break
    chain.unshift(parent)
    current = parent
  }
  return chain
}

/** Ancestors plus the task itself — for breadcrumb UI. */
export function getBreadcrumbChain(taskId: string, allTasks: Task[]): Task[] {
  const task = allTasks.find((t) => t.id === taskId)
  if (!task) return []
  return [...getAncestors(taskId, allTasks), task]
}

/** Depth-first flatten of taskId and all descendants. */
export function flattenSubtree(rootId: string, allTasks: Task[]): Task[] {
  const out: Task[] = []
  const walk = (id: string) => {
    const node = allTasks.find((t) => t.id === id)
    if (!node) return
    out.push(node)
    getChildren(id, allTasks).forEach((c) => walk(c.id))
  }
  walk(rootId)
  return out
}

/** Max depth of subtree relative to root (root = 1). */
function subtreeHeight(taskId: string, allTasks: Task[]): number {
  const children = getChildren(taskId, allTasks)
  if (children.length === 0) return 1
  return 1 + Math.max(...children.map((c) => subtreeHeight(c.id, allTasks)))
}

/** True when taskId is the same as or a descendant of ancestorId. */
export function isDescendantOf(taskId: string, ancestorId: string, allTasks: Task[]): boolean {
  if (taskId === ancestorId) return true
  return flattenSubtree(ancestorId, allTasks).some((t) => t.id === taskId)
}

/** Validate reparent without mutating store. */
export function canReparent(
  taskId: string,
  newParentId: string | null,
  allTasks: Task[]
): { ok: true } | { ok: false; error: string } {
  const task = allTasks.find((t) => t.id === taskId)
  if (!task) return { ok: false, error: 'Task not found' }

  if (newParentId === null) {
    const height = subtreeHeight(taskId, allTasks)
    if (height > MAX_DEPTH) {
      return { ok: false, error: `Subtree exceeds ${MAX_DEPTH} levels when promoted` }
    }
    return { ok: true }
  }

  if (newParentId === taskId) {
    return { ok: false, error: 'Cannot nest a task under itself' }
  }

  if (isDescendantOf(newParentId, taskId, allTasks)) {
    return { ok: false, error: 'Cannot move a task under its own descendant' }
  }

  const newParent = allTasks.find((t) => t.id === newParentId)
  if (!newParent) return { ok: false, error: 'New parent not found' }

  const newBaseDepth = getSubtaskDepth(newParent, allTasks) + 1
  const height = subtreeHeight(taskId, allTasks)
  if (newBaseDepth + height - 1 > MAX_DEPTH) {
    return { ok: false, error: `Move would exceed ${MAX_DEPTH} levels deep` }
  }

  return { ok: true }
}
