'use client'

/** Portfolio health rollup from linked projects. */
import type { Portfolio, Project, ProjectStatus } from '../../types'
import type { Task } from '../../types'

export type PortfolioHealth = {
  progressPct: number
  statusCounts: Record<string, number>
  inferredStatus: ProjectStatus
}

const STATUS_ORDER: (ProjectStatus | 'unset')[] = [
  'on_track',
  'at_risk',
  'off_track',
  'on_hold',
  'complete',
  'unset',
]

export function formatProjectStatus(status: ProjectStatus | null | undefined): string {
  if (!status) return 'Unset'
  return status.replace(/_/g, ' ')
}

export function getProjectStatusColor(status: ProjectStatus | null | undefined): string {
  switch (status) {
    case 'on_track':
    case 'complete':
      return 'hsl(var(--success))'
    case 'at_risk':
      return 'hsl(var(--warning))'
    case 'off_track':
      return 'hsl(var(--destructive))'
    case 'on_hold':
      return 'hsl(var(--foreground-muted))'
    default:
      return 'hsl(var(--foreground-muted))'
  }
}

export function computePortfolioHealth(
  portfolio: Portfolio,
  projects: Project[],
  tasks: Task[]
): PortfolioHealth {
  const linked = projects.filter((p) => portfolio.projectIds.includes(p.id))
  const statusCounts: Record<string, number> = {}

  linked.forEach((p) => {
    const key = p.status ?? 'unset'
    statusCounts[key] = (statusCounts[key] ?? 0) + 1
  })

  let totalTasks = 0
  let completedTasks = 0
  linked.forEach((p) => {
    const projectTasks = tasks.filter((t) => t.projectIds.includes(p.id))
    totalTasks += projectTasks.length
    completedTasks += projectTasks.filter((t) => t.completed).length
  })

  const progressPct = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0

  let inferredStatus: ProjectStatus = portfolio.status ?? 'on_track'
  if (linked.length) {
    if (statusCounts.off_track) inferredStatus = 'off_track'
    else if (statusCounts.at_risk) inferredStatus = 'at_risk'
    else if (linked.every((p) => p.status === 'complete')) inferredStatus = 'complete'
    else if (statusCounts.on_hold && !statusCounts.on_track) inferredStatus = 'on_hold'
    else inferredStatus = 'on_track'
  }

  return { progressPct, statusCounts, inferredStatus }
}

export { STATUS_ORDER }
