/**
 * My Tasks section derivation, assignment timestamps, and layout helpers.
 */
import {
  addDays,
  isBefore,
  isPast,
  isToday,
  parseISO,
  startOfToday,
  subDays,
} from 'date-fns'
import type { ActivityEvent, Project, Task } from '../../types'
import {
  BUILTIN_SECTION_IDS,
  BUILTIN_SECTION_LABELS,
  DEFAULT_MY_TASKS_LAYOUT,
  type BuiltinMyTasksSectionId,
  type MyTasksLayout,
  type MyTasksSectionId,
  type TaskWithMyTasks,
} from './types'

const RECENT_ASSIGN_DAYS = 14

/** Whether a section id is a reserved built-in bucket. */
export function isBuiltinSectionId(id: MyTasksSectionId): id is BuiltinMyTasksSectionId {
  return (BUILTIN_SECTION_IDS as readonly string[]).includes(id)
}

/** Resolve assigned-at timestamp from activity, falling back to modified/created. */
export function buildAssignedAtMap(
  tasks: Task[],
  userId: string,
  activity: ActivityEvent[]
): Map<string, string> {
  const map = new Map<string, string>()
  const byTask = new Map<string, ActivityEvent[]>()
  activity.forEach((ev) => {
    if (!ev.taskId || ev.type !== 'task_assigned') return
    const assigneeId = ev.details.assigneeId as string | undefined
    if (assigneeId !== userId) return
    const list = byTask.get(ev.taskId) ?? []
    list.push(ev)
    byTask.set(ev.taskId, list)
  })
  tasks.forEach((task) => {
    if (task.assigneeId !== userId) return
    const events = byTask.get(task.id)
    const fromActivity = events?.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.createdAt
    map.set(task.id, fromActivity ?? task.modifiedAt ?? task.createdAt)
  })
  return map
}

/** Derive the date-based built-in bucket (ignoring custom overrides). */
export function deriveDateSection(
  task: Task,
  assignedAt: string | undefined,
  now = new Date()
): Exclude<BuiltinMyTasksSectionId, 'completed' | 'recently_assigned'> | 'recently_assigned' {
  if (task.dueOn) {
    const due = parseISO(task.dueOn)
    if (isToday(due) || isPast(due)) return 'today'
    if (isBefore(due, addDays(startOfToday(), 7))) return 'upcoming'
    return 'later'
  }
  if (assignedAt && isBefore(subDays(now, RECENT_ASSIGN_DAYS), parseISO(assignedAt))) {
    return 'recently_assigned'
  }
  return 'later'
}

/** Resolve which section a task belongs in for the current user. */
export function resolveTaskSection(
  task: TaskWithMyTasks,
  userId: string,
  assignedAt: string | undefined,
  showCompleted: boolean
): MyTasksSectionId | null {
  if (task.completed) return showCompleted ? 'completed' : null
  const override = task.myTasksSection?.[userId]
  if (override && !isBuiltinSectionId(override)) return override
  const derived = deriveDateSection(task, assignedAt)
  if (override && isBuiltinSectionId(override) && override !== 'completed') {
    if (derived === 'today' && override !== 'today') return 'today'
    return override
  }
  return derived
}

/** Merge stored layout with defaults and custom sections. */
export function normalizeLayout(raw: MyTasksLayout | undefined): MyTasksLayout {
  const base = raw ?? DEFAULT_MY_TASKS_LAYOUT
  const customIds = base.customSections.map((s) => s.id)
  const order = [
    ...base.sectionOrder.filter((id) => isBuiltinSectionId(id) || customIds.includes(id)),
  ]
  BUILTIN_SECTION_IDS.forEach((id) => {
    if (!order.includes(id)) order.push(id)
  })
  base.customSections.forEach((s) => {
    if (!order.includes(s.id)) order.push(s.id)
  })
  return { ...DEFAULT_MY_TASKS_LAYOUT, ...base, sectionOrder: order }
}

/** Label for a section id using layout overrides. */
export function sectionLabel(id: MyTasksSectionId, layout: MyTasksLayout): string {
  if (isBuiltinSectionId(id)) return layout.sectionLabels?.[id] ?? BUILTIN_SECTION_LABELS[id]
  return layout.customSections.find((s) => s.id === id)?.name ?? 'Section'
}

/** Tasks assigned to me in workspace, excluding archived projects only. */
export function filterMyTasks(
  tasks: Task[],
  projects: Project[],
  workspaceId: string,
  userId: string,
  showSubtasksWhenParentUnassigned: boolean
): Task[] {
  const archived = new Set(projects.filter((p) => p.archived).map((p) => p.id))
  return tasks.filter((task) => {
    if (task.workspaceId !== workspaceId || task.assigneeId !== userId) return false
    if (task.projectIds.length > 0 && task.projectIds.every((pid) => archived.has(pid))) return false
    if (!showSubtasksWhenParentUnassigned && task.parentId) {
      const parent = tasks.find((t) => t.id === task.parentId)
      if (parent && parent.assigneeId !== userId) return false
    }
    return true
  })
}
