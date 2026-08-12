/**
 * Curated chart and dashboard templates for reporting.
 */
import type { Chart } from '../../types'
import type { ChartScope } from './types'

export type ChartTemplate = {
  id: string
  title: string
  description: string
  draft: Omit<Chart, 'id'> & { scope: ChartScope }
}

export const CHART_TEMPLATES: ChartTemplate[] = [
  {
    id: 'burnup-quarter',
    title: 'Tasks completed this quarter',
    description: 'Burnup of cumulative completion over time.',
    draft: {
      title: 'Tasks completed this quarter',
      type: 'burnup',
      source: 'tasks',
      filters: [{ field: 'completed', op: 'eq', value: true }],
      dateField: 'completedAt',
      granularity: 'week',
      measure: 'count',
      scope: { type: 'workspace' },
    },
  },
  {
    id: 'workload-assignee',
    title: 'Workload by assignee',
    description: 'Incomplete tasks grouped by assignee.',
    draft: {
      title: 'Workload by assignee',
      type: 'bar',
      source: 'tasks',
      filters: [{ field: 'completed', op: 'eq', value: false }],
      xAxis: 'assigneeId',
      measure: 'count',
      scope: { type: 'workspace' },
    },
  },
  {
    id: 'project-health',
    title: 'Project health',
    description: 'Projects grouped by status.',
    draft: {
      title: 'Project health',
      type: 'donut',
      source: 'projects',
      filters: [],
      xAxis: 'status',
      measure: 'count',
      scope: { type: 'workspace' },
    },
  },
  {
    id: 'goals-status',
    title: 'Goals by status',
    description: 'Goals distribution by status.',
    draft: {
      title: 'Goals by status',
      type: 'donut',
      source: 'goals',
      filters: [],
      xAxis: 'status',
      measure: 'count',
      scope: { type: 'workspace' },
    },
  },
  {
    id: 'overdue-lollipop',
    title: 'Overdue tasks by project',
    description: 'Ranked overdue tasks per project.',
    draft: {
      title: 'Overdue tasks by project',
      type: 'lollipop',
      source: 'tasks',
      filters: [
        { field: 'due', op: 'before', value: new Date().toISOString().slice(0, 10) },
        { field: 'completed', op: 'eq', value: false },
      ],
      xAxis: 'project',
      measure: 'count',
      scope: { type: 'workspace' },
    },
  },
  {
    id: 'throughput-week',
    title: 'Throughput per week',
    description: 'Completed tasks per week.',
    draft: {
      title: 'Throughput per week',
      type: 'line',
      source: 'tasks',
      filters: [{ field: 'completed', op: 'eq', value: true }],
      dateField: 'completedAt',
      measure: 'count',
      granularity: 'week',
      scope: { type: 'workspace' },
    },
  },
]

export type DashboardTemplate = {
  id: string
  title: string
  description: string
  chartTemplateIds: string[]
}

export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  {
    id: 'team-productivity',
    title: 'Team productivity',
    description: 'Workload, throughput, and completion burnup.',
    chartTemplateIds: ['workload-assignee', 'throughput-week', 'burnup-quarter'],
  },
  {
    id: 'project-health-board',
    title: 'Project health',
    description: 'Status mix and overdue work by project.',
    chartTemplateIds: ['project-health', 'overdue-lollipop', 'goals-status'],
  },
]

/** Resolve chart drafts for a dashboard template id. */
export function chartsForDashboardTemplate(templateId: string): Array<Omit<Chart, 'id'> & { scope: ChartScope }> {
  const template = DASHBOARD_TEMPLATES.find((t) => t.id === templateId)
  if (!template) return []
  return template.chartTemplateIds
    .map((id) => CHART_TEMPLATES.find((c) => c.id === id)?.draft)
    .filter((d): d is Omit<Chart, 'id'> & { scope: ChartScope } => Boolean(d))
}
