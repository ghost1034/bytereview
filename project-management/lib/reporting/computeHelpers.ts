/**
 * Pure chart aggregation helpers — grouping keys and measure math.
 */
import { format, parseISO, startOfMonth, startOfQuarter, startOfWeek } from 'date-fns'
import type { CustomField, Goal, Portfolio, Project, Section, Tag, Task, User } from '../../types'
import { formatProjectStatus } from '../../features/portfolios/portfolioHealth'
import { warmColor } from './palette'
import type { ChartPoint, TimeSeriesPoint } from './types'

export type LabelCtx = {
  users: User[]
  projects: Project[]
  sections: Section[]
  tags: Tag[]
  customFields: CustomField[]
  scopeProjectId?: string
}

function readCustom(task: Task, fieldId: string): unknown {
  const v = task.customFieldValues[fieldId]
  if (!v) return null
  if (v.type === 'dropdown') return v.value
  if (v.type === 'number') return v.value
  if (v.type === 'date') return v.value
  if (v.type === 'text') return v.value
  return null
}

/** Resolve a human label for a grouping key value. */
export function labelForKey(source: string, field: string | undefined, key: string, ctx: LabelCtx): string {
  if (field === 'assigneeId') {
    if (key === 'unassigned') return 'Unassigned'
    return ctx.users.find((u) => u.id === key)?.name ?? key
  }
  if (field === 'ownerId' || field === 'completedById') {
    return ctx.users.find((u) => u.id === key)?.name ?? key
  }
  if (field === 'project') return ctx.projects.find((p) => p.id === key)?.name ?? key
  if (field === 'section') return ctx.sections.find((s) => s.id === key)?.name ?? 'No section'
  if (field === 'tag') return ctx.tags.find((t) => t.id === key)?.name ?? key
  if (field === 'completed') return key === 'true' ? 'Completed' : 'Incomplete'
  if (field === 'status' && source !== 'tasks') return formatProjectStatus(key as Project['status'])
  if (field?.startsWith('customField:')) {
    const id = field.slice('customField:'.length)
    const cf = ctx.customFields.find((f) => f.id === id)
    if (cf?.type === 'dropdown') return cf.options?.find((o) => o.id === key)?.label ?? key
  }
  return key
}

/** Extract grouping key from a task row. */
export function taskGroupKey(task: Task, field: string, ctx: LabelCtx): string {
  switch (field) {
    case 'assigneeId':
      return task.assigneeId ?? 'unassigned'
    case 'completed':
      return String(task.completed)
    case 'project':
      return task.projectIds[0] ?? 'none'
    case 'section': {
      const pid = ctx.scopeProjectId ?? task.projectIds[0]
      return pid ? (task.sectionIdByProject[pid] ?? 'none') : 'none'
    }
    case 'tag':
      return task.tagIds[0] ?? 'none'
    case 'createdAt':
    case 'dueOn':
    case 'startOn':
    case 'completedAt': {
      const raw = field === 'completedAt' ? task.completedAt : (task as Record<string, unknown>)[field]
      if (!raw || typeof raw !== 'string') return 'none'
      return format(startOfWeek(parseISO(raw.slice(0, 10))), 'yyyy-MM-dd')
    }
    default:
      if (field.startsWith('customField:')) {
        const id = field.slice('customField:'.length)
        const val = readCustom(task, id)
        return val == null ? 'none' : String(val)
      }
      if (ctx.customFields.some((f) => f.id === field)) {
        const val = readCustom(task, field)
        return val == null ? 'none' : String(val)
      }
      return 'none'
  }
}

export function projectGroupKey(project: Project, field: string): string {
  if (field === 'status') return project.status ?? 'unset'
  if (field === 'teamId') return project.teamId
  if (field === 'ownerId') return project.ownerId
  return 'none'
}

export function goalGroupKey(goal: Goal, field: string): string {
  if (field === 'status') return goal.status
  if (field === 'ownerId') return goal.ownerId
  return 'none'
}

export function portfolioGroupKey(portfolio: Portfolio, field: string): string {
  if (field === 'status') return portfolio.status ?? 'unset'
  return 'none'
}

export function measureFromTasks(tasks: Task[], measure: 'count' | 'sum' | 'avg', field?: string): number {
  if (measure === 'count') return tasks.length
  const nums = tasks.map((t) => numericFromTask(t, field)).filter((n): n is number => n != null)
  if (!nums.length) return 0
  const sum = nums.reduce((a, b) => a + b, 0)
  return measure === 'avg' ? sum / nums.length : sum
}

function numericFromTask(task: Task, field?: string): number | null {
  if (!field || field === 'taskCount') return 1
  if (field === 'progress') return task.completed ? 100 : 0
  const v = task.customFieldValues[field]
  if (v?.type === 'number') return v.value
  if (v?.type === 'formula' && typeof v.value === 'number') return v.value
  return null
}

export function bucketDate(iso: string, granularity: 'day' | 'week' | 'month' | 'quarter'): string {
  const d = parseISO(iso.slice(0, 10))
  if (granularity === 'day') return format(d, 'yyyy-MM-dd')
  if (granularity === 'week') return format(startOfWeek(d), 'yyyy-MM-dd')
  if (granularity === 'month') return format(startOfMonth(d), 'yyyy-MM')
  return format(startOfQuarter(d), 'yyyy-QQQ')
}

export function toCategoricalPoints(
  buckets: Map<string, { value: number; ids: string[] }>,
  field: string | undefined,
  source: string,
  ctx: LabelCtx,
  topN?: number
): ChartPoint[] {
  let entries = [...buckets.entries()].sort((a, b) => b[1].value - a[1].value)
  if (topN && topN > 0) entries = entries.slice(0, topN)
  return entries.map(([key, row], i) => ({
    key,
    label: labelForKey(source, field, key, ctx),
    value: row.value,
    recordIds: row.ids,
    color: warmColor(i),
  }))
}

export function toTimeSeries(points: Map<string, { y: number; ids: string[] }>): TimeSeriesPoint[] {
  return [...points.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([x, row]) => ({ x, label: x, y: row.y, recordIds: row.ids }))
}
