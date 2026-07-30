import type { Project, Task, Team, User } from '../../types'
import type { ISODate } from '../../types'

export type WorkloadScopeMode = 'all' | 'team' | 'project'

export type WorkloadScope = {
  workspaceId: string
  mode: WorkloadScopeMode
  teamId?: string
  projectId?: string
  portfolioProjectIds?: string[]
}

/** Tasks visible for the active workload scope. */
export function filterTasksForScope(
  tasks: Task[],
  projects: Project[],
  scope: WorkloadScope
): Task[] {
  const activeProjects = projects.filter((p) => p.workspaceId === scope.workspaceId && !p.archived)
  let allowed = new Set(activeProjects.map((p) => p.id))

  if (scope.portfolioProjectIds?.length) {
    allowed = new Set(scope.portfolioProjectIds.filter((id) => allowed.has(id)))
  }
  if (scope.mode === 'project' && scope.projectId) {
    allowed = new Set([scope.projectId].filter((id) => allowed.has(id)))
  }
  if (scope.mode === 'team' && scope.teamId) {
    const teamProjectIds = activeProjects.filter((p) => p.teamId === scope.teamId).map((p) => p.id)
    allowed = new Set([...allowed].filter((id) => teamProjectIds.includes(id)))
  }

  return tasks.filter(
    (t) =>
      t.workspaceId === scope.workspaceId &&
      !t.completed &&
      t.projectIds.some((id) => allowed.has(id))
  )
}

/** Users to show as workload rows. */
export function resolveWorkloadPeople(
  scopedTasks: Task[],
  users: User[],
  workspaceMemberIds: string[],
  teams: Team[],
  scope: WorkloadScope
): Array<{ userId: string; user?: User; label: string }> {
  const assigneeIds = new Set<string>()
  scopedTasks.forEach((t) => assigneeIds.add(t.assigneeId ?? '__unassigned__'))

  let memberPool = workspaceMemberIds
  if (scope.mode === 'team' && scope.teamId) {
    const team = teams.find((t) => t.id === scope.teamId)
    memberPool = team?.memberIds ?? memberPool
  }

  const rows: Array<{ userId: string; user?: User; label: string }> = []
  memberPool.forEach((id) => {
    const user = users.find((u) => u.id === id)
    if (user) rows.push({ userId: id, user, label: user.name })
  })
  if (assigneeIds.has('__unassigned__')) {
    rows.push({ userId: '__unassigned__', label: 'Unassigned' })
  }
  assigneeIds.forEach((id) => {
    if (id === '__unassigned__') return
    if (rows.some((r) => r.userId === id)) return
    const user = users.find((u) => u.id === id)
    rows.push({ userId: id, user, label: user?.name ?? 'Unknown' })
  })
  return rows.sort((a, b) => a.label.localeCompare(b.label))
}

/** Tasks assigned to a user that contribute effort in a bucket date span. */
export function tasksInBucketForUser(
  tasks: Task[],
  userId: string,
  bucketStart: ISODate,
  bucketEnd: ISODate
): Task[] {
  return tasks.filter((t) => {
    const assignee = t.assigneeId ?? '__unassigned__'
    if (assignee !== userId) return false
    const start = t.startOn ?? t.dueOn
    const end = t.dueOn ?? t.startOn
    if (!start && !end) return true
    const tStart = start ?? end!
    const tEnd = end ?? start!
    return tStart <= bucketEnd && tEnd >= bucketStart
  })
}
