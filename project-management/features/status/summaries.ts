/**
 * Project activity digest for status composer prompts and AI step 28.
 */
import { addDays, isAfter, isBefore, parseISO, startOfDay, subDays } from 'date-fns'
import type { StatusUpdate, Task, User } from '../../types'
import { useStatusUpdatesStore, useTasksStore, useUsersStore } from '../../stores/entities'

export type ProjectActivityDigest = {
  tasksCompleted: Task[]
  tasksOverdue: Task[]
  upcomingDue: Task[]
  recentMilestones: Task[]
  topContributors: User[]
}

function projectTasks(projectId: string): Task[] {
  return useTasksStore.getState().list().filter((t) => t.projectIds.includes(projectId))
}

/** Structured activity summary since an ISO datetime (default: 7 days ago). */
export function summarizeProjectActivity(projectId: string, since?: string): ProjectActivityDigest {
  const sinceDate = since ? parseISO(since) : subDays(new Date(), 7)
  const today = startOfDay(new Date())
  const weekOut = addDays(today, 7)
  const scoped = projectTasks(projectId)

  const tasksCompleted = scoped.filter(
    (t) => t.completed && t.completedAt && isAfter(parseISO(t.completedAt), sinceDate)
  )
  const tasksOverdue = scoped.filter(
    (t) => !t.completed && t.dueOn && isBefore(parseISO(t.dueOn), today)
  )
  const upcomingDue = scoped.filter((t) => {
    if (t.completed || !t.dueOn) return false
    const due = parseISO(t.dueOn)
    return !isBefore(due, today) && !isAfter(due, weekOut)
  })
  const recentMilestones = scoped.filter(
    (t) =>
      t.resourceSubtype === 'milestone' &&
      isAfter(parseISO(t.modifiedAt), sinceDate)
  )

  const counts = new Map<string, number>()
  tasksCompleted.forEach((t) => {
    const id = t.completedById ?? t.assigneeId
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  })
  const topContributors = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => useUsersStore.getState().getById(id))
    .filter((u): u is User => Boolean(u))

  return { tasksCompleted, tasksOverdue, upcomingDue, recentMilestones, topContributors }
}

/** Count tasks added to a project since a date. */
export function countTasksAddedSince(projectId: string, since: string): number {
  const sinceDate = parseISO(since)
  return projectTasks(projectId).filter((t) => isAfter(parseISO(t.createdAt), sinceDate)).length
}

/** Latest status update for a scoped entity (project, portfolio, or goal). */
export function latestStatusUpdate(
  scope: StatusUpdate['scope']
): StatusUpdate | undefined {
  return useStatusUpdatesStore
    .getState()
    .list()
    .filter((u) => u.scope.type === scope.type && u.scope.id === scope.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
}

/** True when no status update was posted within the last N days (default 7). */
export function isStatusUpdateDue(scope: StatusUpdate['scope'], days = 7): boolean {
  const latest = latestStatusUpdate(scope)
  if (!latest) return true
  return isBefore(parseISO(latest.createdAt), subDays(new Date(), days))
}
