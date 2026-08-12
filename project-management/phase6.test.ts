import { describe, expect, it } from 'vitest'
import type { Chart, Dashboard, Task, Workspace } from './types'
import { canEditDashboard, canManageDashboardSharing, canViewDashboard } from './lib/reporting/dashboardPermissions'
import { computeChart, type ChartComputeContext } from './lib/reporting/computeChart'
import { reportingSource, reportingSources } from './lib/reporting/sourceRegistry'
import { nextRunForFrequency } from './lib/reporting/scheduler'

const timestamp = '2026-08-12T00:00:00.000Z'
const workspace: Workspace = {
  id: 'w1', name: 'Acme', memberIds: ['owner', 'editor', 'viewer', 'member'], adminIds: ['admin'],
  guestIds: ['guest'], createdAt: timestamp,
}
const dashboard: Dashboard = {
  id: 'd1', workspaceId: 'w1', name: 'Operations', ownerId: 'owner', charts: [], layout: [],
  sharedWith: ['editor'], editorIds: ['editor'], viewerIds: ['viewer'], visibility: 'people', createdAt: timestamp,
}
const task = (id: string, completedAt: string): Task => ({
  id, workspaceId: 'w1', name: id, resourceSubtype: 'default_task', completed: true,
  completedAt, collaboratorIds: [], projectIds: ['p1'], sectionIdByProject: {}, tagIds: [],
  customFieldValues: {}, dependencyIds: [], dependentIds: [], attachmentIds: [], likedByIds: [],
  createdAt: timestamp, modifiedAt: timestamp,
})

describe('Phase 6 automation and reporting', () => {
  it('registers current sources through an extensible reporting registry', () => {
    expect(reportingSources().map((source) => source.id)).toEqual([
      'tasks', 'projects', 'portfolios', 'goals', 'time', 'expenses', 'utilization', 'wip',
      'invoices', 'payments', 'realization', 'effective_rate', 'ar_aging',
    ])
    expect(reportingSource('tasks').dateFields.map((field) => field.id)).toContain('completedAt')
    expect(reportingSource('projects').measureFields).toContainEqual({ id: 'taskCount', label: 'Task count' })
  })

  it('keeps chart date field, granularity, metric field, and top-N independent', () => {
    const chart: Chart = {
      id: 'throughput', title: 'Throughput', type: 'line', source: 'tasks', filters: [],
      measure: 'count', dateField: 'completedAt', granularity: 'month', topN: 5,
    }
    const context: ChartComputeContext = {
      workspaceId: 'w1', tasks: [task('jan', '2026-01-03T00:00:00Z'), task('feb', '2026-02-04T00:00:00Z')],
      projects: [], portfolios: [], goals: [], users: [], sections: [], tags: [], customFields: [], savedViews: [],
    }
    const computed = computeChart(chart, context)
    expect(computed.kind).toBe('timeseries')
    if (computed.kind === 'timeseries') expect(computed.points.map((point) => point.x)).toEqual(['2026-01', '2026-02'])
    expect(chart.dateField).toBe('completedAt')
    expect(chart.granularity).toBe('month')
  })

  it('distinguishes dashboard viewers, editors, owners, and workspace visibility', () => {
    expect(canViewDashboard(dashboard, 'viewer', workspace)).toBe(true)
    expect(canEditDashboard(dashboard, 'viewer', workspace)).toBe(false)
    expect(canEditDashboard(dashboard, 'editor', workspace)).toBe(true)
    expect(canManageDashboardSharing(dashboard, 'editor', workspace)).toBe(false)
    expect(canManageDashboardSharing(dashboard, 'owner', workspace)).toBe(true)
    expect(canViewDashboard({ ...dashboard, visibility: 'workspace', viewerIds: [], editorIds: [], sharedWith: [] }, 'member', workspace)).toBe(true)
    expect(canViewDashboard({ ...dashboard, visibility: 'workspace', viewerIds: [], editorIds: [], sharedWith: [] }, 'guest', workspace)).toBe(false)
  })

  it('computes the initial visible next-run timestamp without executing a client scheduler', () => {
    const from = new Date('2026-08-12T16:30:00Z')
    expect(nextRunForFrequency('daily', from)).toBe(new Date(2026, 7, 13).toISOString())
    expect(nextRunForFrequency('monthly_1st', from)).toBe(new Date(2026, 8, 1).toISOString())
  })
})
