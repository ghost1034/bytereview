/**
 * Aggregate portfolio metrics for Progress and Dashboard tabs.
 */
import { isBefore, parseISO } from 'date-fns'
import type { Goal, Portfolio, Project, ProjectStatus, Task } from '../../types'
import { projectProgress } from '../../features/projects/projectUtils'
import { computePortfolioHealth } from '../../features/portfolios/portfolioHealth'
import { getGoalProgressPercent } from '../../features/goals/goalProgress'

export type PortfolioQuickStats = {
  totalProjects: number
  progressPct: number
  onTimePct: number
  memberCount: number
  statusCounts: Record<string, number>
  inferredStatus: ProjectStatus
}

export type TasksCompletedPoint = { date: string; count: number }

/** Roll up quick stats for the Progress tab header card. */
export function computePortfolioQuickStats(
  portfolio: Portfolio,
  projects: Project[],
  tasks: Task[]
): PortfolioQuickStats {
  const health = computePortfolioHealth(portfolio, projects, tasks)
  const linked = projects.filter((p) => portfolio.projectIds.includes(p.id))
  const today = new Date()

  let onTime = 0
  let withDue = 0
  linked.forEach((p) => {
    if (!p.dueOn) return
    withDue += 1
    const due = parseISO(p.dueOn)
    if (p.status === 'complete' || !isBefore(due, today)) onTime += 1
  })

  const memberIds = new Set<string>([portfolio.ownerId])
  linked.forEach((p) => p.memberIds.forEach((id) => memberIds.add(id)))

  return {
    totalProjects: linked.length,
    progressPct: health.progressPct,
    onTimePct: withDue ? Math.round((onTime / withDue) * 100) : 100,
    memberCount: memberIds.size,
    statusCounts: health.statusCounts,
    inferredStatus: health.inferredStatus,
  }
}

/** Average completion % across linked projects. */
export function averageProjectProgress(projects: Project[], tasks: Task[], portfolio: Portfolio): number {
  const linked = projects.filter((p) => portfolio.projectIds.includes(p.id))
  if (!linked.length) return 0
  const sum = linked.reduce((acc, p) => acc + projectProgress(tasks, p.id), 0)
  return Math.round(sum / linked.length)
}

/** Projects grouped by owner for bar charts. */
export function projectsByOwner(
  projects: Project[],
  portfolio: Portfolio
): { ownerId: string; ownerName: string; count: number }[] {
  const linked = projects.filter((p) => portfolio.projectIds.includes(p.id))
  const map = new Map<string, number>()
  linked.forEach((p) => map.set(p.ownerId, (map.get(p.ownerId) ?? 0) + 1))
  return [...map.entries()].map(([ownerId, count]) => ({ ownerId, ownerName: ownerId, count }))
}

/** Tasks completed per day over the last N days for line chart. */
export function tasksCompletedOverTime(
  tasks: Task[],
  portfolio: Portfolio,
  days = 14
): TasksCompletedPoint[] {
  const projectSet = new Set(portfolio.projectIds)
  const scoped = tasks.filter(
    (t) => t.completed && t.completedAt && t.projectIds.some((id) => projectSet.has(id))
  )
  const points: TasksCompletedPoint[] = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const count = scoped.filter((t) => t.completedAt?.slice(0, 10) === key).length
    points.push({ date: key, count })
  }
  return points
}

/** Goal progress rows for linked goals. */
export function linkedGoalProgress(goals: Goal[], portfolio: Portfolio) {
  return goals
    .filter((g) => portfolio.goalIds.includes(g.id))
    .map((g) => ({ goal: g, pct: getGoalProgressPercent(g) }))
}
