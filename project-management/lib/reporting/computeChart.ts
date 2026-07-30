/**
 * computeChart — pure aggregation from Chart config + workspace entities.
 */
import type { Chart, CustomField, Goal, Portfolio, Project, SavedView, Section, Tag, Task, User } from '../../types'
import type { ApplyQueryContext, FilterClause } from '../query/types'
import {
  bucketDate,
  goalGroupKey,
  measureFromTasks,
  portfolioGroupKey,
  projectGroupKey,
  taskGroupKey,
  toCategoricalPoints,
  toTimeSeries,
  type LabelCtx,
} from './computeHelpers'
import { scopedGoals, scopedPortfolios, scopedProjects, scopedTasks } from './scopeUtils'
import { splitScopeFromFilters, type BurnupPoint, type ChartComputed, type ChartScope } from './types'

export type ChartComputeContext = {
  workspaceId: string
  tasks: Task[]
  projects: Project[]
  portfolios: Portfolio[]
  goals: Goal[]
  users: User[]
  sections: Section[]
  tags: Tag[]
  customFields: CustomField[]
  savedViews: SavedView[]
  scopeProjectId?: string
  granularity?: 'day' | 'week' | 'month' | 'quarter'
  topN?: number
}

function scopeCtx(scope: ChartScope, ctx: ChartComputeContext): Parameters<typeof scopedTasks>[2] {
  const queryCtx: ApplyQueryContext = {
    projectId: ctx.scopeProjectId ?? ctx.projects[0]?.id ?? '',
    currentUserId: null,
    sections: ctx.sections,
    users: ctx.users,
    tags: ctx.tags,
    customFields: ctx.customFields,
    projects: ctx.projects,
  }
  return { scope, workspaceId: ctx.workspaceId, projects: ctx.projects, portfolios: ctx.portfolios, savedViews: ctx.savedViews, queryCtx }
}

function labelCtx(ctx: ChartComputeContext): LabelCtx {
  return { users: ctx.users, projects: ctx.projects, sections: ctx.sections, tags: ctx.tags, customFields: ctx.customFields, scopeProjectId: ctx.scopeProjectId }
}

/** Compute rendered series for a chart definition. */
export function computeChart(chart: Chart, ctx: ChartComputeContext): ChartComputed {
  const { scope, filters } = splitScopeFromFilters(chart.filters)
  const sCtx = scopeCtx(scope, ctx)
  const field = chart.xAxis ?? 'assigneeId'
  const gran = ctx.granularity ?? (chart.measureField as ChartComputeContext['granularity']) ?? 'week'

  if (chart.type === 'number') {
    const tasks = scopedTasks(ctx.tasks, filters as FilterClause[], sCtx)
    return {
      kind: 'number',
      value: measureFromTasks(tasks, chart.measure, chart.measureField),
      subtitle: chart.measure === 'count' ? 'records' : chart.measureField ?? chart.measure,
      recordIds: tasks.map((t) => t.id),
    }
  }

  if (chart.type === 'burnup' || (chart.type === 'line' && chart.yAxis)) {
    const dateField = chart.yAxis ?? 'completedAt'
    const tasks = scopedTasks(ctx.tasks, filters as FilterClause[], sCtx)
    if (chart.type === 'burnup') {
      const byDate = new Map<string, BurnupPoint>()
      for (const task of [...tasks].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
        const created = bucketDate(task.createdAt, gran)
        const point = byDate.get(created) ?? { date: created, label: created, total: 0, completed: 0, recordIds: [] }
        point.total += 1
        byDate.set(created, point)
      }
      for (const task of tasks.filter((t) => t.completed && t.completedAt)) {
        const done = bucketDate(task.completedAt!, gran)
        const point = byDate.get(done) ?? { date: done, label: done, total: 0, completed: 0, recordIds: [] }
        point.completed += 1
        point.recordIds.push(task.id)
        byDate.set(done, point)
      }
      let runningTotal = 0
      let runningDone = 0
      const burnup = [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, p]) => {
          runningTotal += p.total
          runningDone += p.completed
          return { date, label: date, total: runningTotal, completed: runningDone, recordIds: p.recordIds }
        })
      return { kind: 'burnup', points: burnup }
    }
    const buckets = new Map<string, { y: number; ids: string[] }>()
    for (const task of tasks) {
      const raw = (task as Record<string, unknown>)[dateField]
      if (typeof raw !== 'string') continue
      const key = bucketDate(raw, gran)
      const prev = buckets.get(key) ?? { y: 0, ids: [] }
      buckets.set(key, { y: prev.y + 1, ids: [...prev.ids, task.id] })
    }
    return { kind: 'timeseries', points: toTimeSeries(buckets) }
  }

  if (chart.source === 'tasks') {
    const tasks = scopedTasks(ctx.tasks, filters as FilterClause[], sCtx)
    if (field === 'tag') {
      const buckets = new Map<string, { value: number; ids: string[] }>()
      for (const task of tasks) {
        const tags = task.tagIds.length ? task.tagIds : ['none']
        for (const tagId of tags) {
          const prev = buckets.get(tagId) ?? { value: 0, ids: [] }
          buckets.set(tagId, { value: prev.value + 1, ids: [...prev.ids, task.id] })
        }
      }
      const points = toCategoricalPoints(buckets, field, chart.source, labelCtx(ctx), ctx.topN)
      return { kind: 'categorical', points, total: points.reduce((s, p) => s + p.value, 0) }
    }
    const buckets = new Map<string, { value: number; ids: string[] }>()
    for (const task of tasks) {
      const group = taskGroupKey(task, field, labelCtx(ctx))
      const prev = buckets.get(group) ?? { value: 0, ids: [] }
      buckets.set(group, {
        value: prev.value + measureFromTasks([task], chart.measure, chart.measureField),
        ids: [...prev.ids, task.id],
      })
    }
    const points = toCategoricalPoints(buckets, field, chart.source, labelCtx(ctx), ctx.topN)
    return { kind: 'categorical', points, total: points.reduce((s, p) => s + p.value, 0) }
  }

  if (chart.source === 'projects') {
    const projects = scopedProjects(ctx.projects, sCtx)
    const buckets = new Map<string, { value: number; ids: string[] }>()
    for (const project of projects) {
      const group = projectGroupKey(project, field)
      const prev = buckets.get(group) ?? { value: 0, ids: [] }
      buckets.set(group, { value: prev.value + 1, ids: [...prev.ids, project.id] })
    }
    const points = toCategoricalPoints(buckets, field, chart.source, labelCtx(ctx), ctx.topN)
    return { kind: 'categorical', points, total: points.reduce((s, p) => s + p.value, 0) }
  }

  if (chart.source === 'goals') {
    const goals = scopedGoals(ctx.goals, sCtx)
    const buckets = new Map<string, { value: number; ids: string[] }>()
    for (const goal of goals) {
      const group = goalGroupKey(goal, field)
      const prev = buckets.get(group) ?? { value: 0, ids: [] }
      buckets.set(group, { value: prev.value + 1, ids: [...prev.ids, goal.id] })
    }
    const points = toCategoricalPoints(buckets, field, chart.source, labelCtx(ctx), ctx.topN)
    return { kind: 'categorical', points, total: points.reduce((s, p) => s + p.value, 0) }
  }

  const portfolios = scopedPortfolios(ctx.portfolios, sCtx)
  const buckets = new Map<string, { value: number; ids: string[] }>()
  for (const portfolio of portfolios) {
    const group = portfolioGroupKey(portfolio, field)
    const prev = buckets.get(group) ?? { value: 0, ids: [] }
    buckets.set(group, { value: prev.value + 1, ids: [...prev.ids, portfolio.id] })
  }
  const points = toCategoricalPoints(buckets, field, chart.source, labelCtx(ctx), ctx.topN)
  return { kind: 'categorical', points, total: points.reduce((s, p) => s + p.value, 0) }
}
