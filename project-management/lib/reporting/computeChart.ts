/**
 * computeChart — pure aggregation from Chart config + workspace entities.
 */
import type { Chart, CustomField, Expense, Goal, Invoice, Payment, Portfolio, Project, SavedView, Section, Tag, Task, TimeEntry, User } from '../../types'
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
  timeEntries?: TimeEntry[]
  expenses?: Expense[]
  invoices?: Invoice[]
  payments?: Payment[]
  scopeProjectId?: string
  granularity?: 'day' | 'week' | 'month' | 'quarter'
  topN?: number
}

function computePsaChart(chart: Chart, ctx: ChartComputeContext): ChartComputed {
  const sourceRows: Array<Record<string, unknown> & { id: string }> = chart.source === 'expenses'
    ? (ctx.expenses ?? [])
    : chart.source === 'invoices'
      ? (ctx.invoices ?? [])
      : chart.source === 'payments'
        ? (ctx.payments ?? [])
        : chart.source === 'ar_aging'
          ? (ctx.invoices ?? []).filter((invoice) => (invoice.amountOutstanding ?? 0) > 0 && !['paid', 'void', 'written_off'].includes(invoice.status)).map((invoice) => {
              const days = Math.floor((Date.now() - new Date(invoice.dueOn).getTime()) / 86400000)
              return { ...invoice, agingBucket: days <= 0 ? 'Current' : days <= 30 ? '1-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+' }
            })
          : chart.source === 'realization'
            ? (ctx.timeEntries ?? []).filter((entry) => entry.status === 'billed').map((entry) => ({ ...entry, realizationPercent: (entry.rateSnapshot ?? 0) * entry.hours > 0 ? ((entry.amount ?? 0) / ((entry.rateSnapshot ?? 0) * entry.hours)) * 100 : 0 }))
            : chart.source === 'effective_rate'
              ? (ctx.timeEntries ?? []).filter((entry) => entry.status === 'billed').map((entry) => ({ ...entry, effectiveRate: entry.hours > 0 ? (entry.amount ?? 0) / entry.hours : 0 }))
    : chart.source === 'wip'
      ? [
          ...(ctx.timeEntries ?? []).filter((row) => row.billable && ['submitted', 'approved'].includes(row.status ?? 'draft')).map((row) => ({ ...row, amount: row.amount ?? 0 })),
          ...(ctx.expenses ?? []).filter((row) => row.billable && ['submitted', 'approved'].includes(row.status ?? 'draft')).map((row) => ({ ...row, amount: row.billableAmount ?? row.totalAmount ?? row.amount })),
        ]
      : (ctx.timeEntries ?? [])
  const filters = chart.filters.filter((filter) => filter.field !== '__scope')
  const rows = sourceRows.filter((row) => filters.every((filter) => {
    const value = row[filter.field]
    if (filter.op === 'eq') return value === filter.value
    if (filter.op === 'neq') return value !== filter.value
    if (filter.op === 'contains') return String(value ?? '').toLowerCase().includes(String(filter.value ?? '').toLowerCase())
    return true
  }))
  const metric = (row: Record<string, unknown>) => {
    if (chart.source === 'utilization' && chart.measureField === 'utilizationPercent') return row.billable ? Number(row.hours ?? 0) : 0
    if (chart.measure === 'count') return 1
    return Number(row[chart.measureField ?? (chart.source === 'time' ? 'hours' : chart.source === 'invoices' ? 'total' : 'amount')] ?? 0)
  }
  if (chart.type === 'number') {
    const currencies = new Set(rows.map((row) => String(row.currency ?? 'USD')))
    const currencySensitive = ['time', 'expenses', 'wip', 'invoices', 'payments', 'realization', 'effective_rate', 'ar_aging'].includes(chart.source)
    if (currencySensitive && currencies.size > 1) {
      const byCurrency = new Map<string, { value: number; ids: string[] }>()
      for (const row of rows) {
        const currency = String(row.currency ?? 'USD')
        const bucket = byCurrency.get(currency) ?? { value: 0, ids: [] }
        bucket.value += metric(row); bucket.ids.push(row.id); byCurrency.set(currency, bucket)
      }
      const points = [...byCurrency].map(([currency, bucket]) => ({ key: currency, label: currency, value: bucket.value, recordIds: bucket.ids }))
      return { kind: 'categorical', points, total: 0 }
    }
    const value = rows.reduce((sum, row) => sum + metric(row), 0)
    const normalized = chart.source === 'utilization' && chart.measureField === 'utilizationPercent'
      ? (value / Math.max(1, rows.reduce((sum, row) => sum + Number(row.hours ?? 0), 0))) * 100
      : chart.measure === 'avg' ? value / Math.max(1, rows.length) : value
    return { kind: 'number', value: normalized, subtitle: chart.measureField ?? 'records', recordIds: rows.map((row) => row.id) }
  }
  if (chart.type === 'line') {
    const field = chart.dateField ?? 'date'
    const buckets = new Map<string, { y: number; ids: string[] }>()
    for (const row of rows) {
      const raw = row[field]
      if (typeof raw !== 'string') continue
      const key = bucketDate(raw, chart.granularity ?? 'week')
      const bucket = buckets.get(key) ?? { y: 0, ids: [] }
      bucket.y += metric(row); bucket.ids.push(row.id); buckets.set(key, bucket)
    }
    return { kind: 'timeseries', points: toTimeSeries(buckets) }
  }
  const field = chart.xAxis ?? 'status'
  const buckets = new Map<string, { value: number; ids: string[] }>()
  for (const row of rows) {
    const key = String(row[field] ?? 'Unspecified')
    const bucket = buckets.get(key) ?? { value: 0, ids: [] }
    bucket.value += metric(row); bucket.ids.push(row.id); buckets.set(key, bucket)
  }
  const points = [...buckets].map(([key, value]) => ({ key, label: key, value: chart.measure === 'avg' ? value.value / Math.max(1, value.ids.length) : value.value, recordIds: value.ids }))
  return { kind: 'categorical', points, total: points.reduce((sum, point) => sum + point.value, 0) }
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
  if (['time', 'expenses', 'utilization', 'wip', 'invoices', 'payments', 'realization', 'effective_rate', 'ar_aging'].includes(chart.source)) return computePsaChart(chart, ctx)
  const { scope, filters } = splitScopeFromFilters(chart.filters)
  const sCtx = scopeCtx(scope, ctx)
  const field = chart.xAxis ?? 'assigneeId'
  const gran = chart.granularity ?? ctx.granularity ?? 'week'

  if (chart.type === 'number') {
    const tasks = scopedTasks(ctx.tasks, filters as FilterClause[], sCtx)
    return {
      kind: 'number',
      value: measureFromTasks(tasks, chart.measure, chart.measureField),
      subtitle: chart.measure === 'count' ? 'records' : chart.measureField ?? chart.measure,
      recordIds: tasks.map((t) => t.id),
    }
  }

  if (chart.type === 'burnup' || (chart.type === 'line' && (chart.dateField || chart.yAxis))) {
    const dateField = chart.dateField ?? chart.yAxis ?? 'completedAt'
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
      const points = toCategoricalPoints(buckets, field, chart.source, labelCtx(ctx), chart.topN ?? ctx.topN)
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
    const points = toCategoricalPoints(buckets, field, chart.source, labelCtx(ctx), chart.topN ?? ctx.topN)
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
    const points = toCategoricalPoints(buckets, field, chart.source, labelCtx(ctx), chart.topN ?? ctx.topN)
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
    const points = toCategoricalPoints(buckets, field, chart.source, labelCtx(ctx), chart.topN ?? ctx.topN)
    return { kind: 'categorical', points, total: points.reduce((s, p) => s + p.value, 0) }
  }

  const portfolios = scopedPortfolios(ctx.portfolios, sCtx)
  const buckets = new Map<string, { value: number; ids: string[] }>()
  for (const portfolio of portfolios) {
    const group = portfolioGroupKey(portfolio, field)
    const prev = buckets.get(group) ?? { value: 0, ids: [] }
    buckets.set(group, { value: prev.value + 1, ids: [...prev.ids, portfolio.id] })
  }
  const points = toCategoricalPoints(buckets, field, chart.source, labelCtx(ctx), chart.topN ?? ctx.topN)
  return { kind: 'categorical', points, total: points.reduce((s, p) => s + p.value, 0) }
}
