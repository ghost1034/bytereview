/**
 * Pure view-query pipeline: filter → search → sort.
 */
import type { Task } from '../../types'
import { applyFilters } from './filterMatch'
import { sortTasks } from './sortTasks'
import { groupTasks } from './groupTasks'
import type { ApplyQueryContext, FilterClause, GroupingKey, TaskGroup, ViewQuery } from './types'

export type {
  ApplyQueryContext,
  FilterClause,
  FilterOp,
  FilterFieldDef,
  GroupingKey,
  TaskGroup,
  ViewQuery,
  ViewDensity,
} from './types'

export { DEFAULT_VIEW_QUERY, QUICK_FILTERS, QUICK_FILTER_PRESETS, SORT_FIELD_OPTIONS, GROUP_BY_OPTIONS, LIST_HIDEABLE_FIELDS } from './constants'
export { groupTasks } from './groupTasks'
export { matchClause, applyFilters } from './filterMatch'
export { resolvesShowCompleted, resolveSort, resolvesSwimlanes, patchViewQuery, isQueryModified } from './viewQueryHelpers'

function stripHtml(html: string | undefined): string {
  return (html ?? '').replace(/<[^>]+>/g, '')
}

function normalizeCtx(
  projectIdOrCtx: string | ApplyQueryContext,
  currentUserId?: string | null
): ApplyQueryContext {
  if (typeof projectIdOrCtx === 'string') {
    return { projectId: projectIdOrCtx, currentUserId }
  }
  return projectIdOrCtx
}

/** Apply filters, quick search, and sort to a task list. */
export function applyViewQuery(
  tasks: Task[],
  query: ViewQuery,
  projectIdOrCtx: string | ApplyQueryContext,
  currentUserId?: string | null
): Task[] {
  const ctx = normalizeCtx(projectIdOrCtx, currentUserId)
  let result = [...tasks]

  const showCompleted = ctx.forceShowCompleted ?? (query.hiddenCompleted !== undefined ? !query.hiddenCompleted : query.showCompleted)
  if (!showCompleted) {
    result = result.filter((t) => !t.completed)
  }

  if (query.search.trim()) {
    const q = query.search.trim().toLowerCase()
    result = result.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        stripHtml(t.notes).toLowerCase().includes(q)
    )
  }

  result = applyFilters(result, query.filters, ctx)
  result = sortTasks(result, query, ctx)
  return result
}

/** Filter, sort, and group tasks for view rendering. */
export function applyViewQueryGrouped(
  tasks: Task[],
  query: ViewQuery,
  ctx: ApplyQueryContext
): { tasks: Task[]; groups: TaskGroup[] } {
  const filtered = applyViewQuery(tasks, query, ctx)
  const groups = groupTasks(filtered, query.groupBy, ctx)
  return { tasks: filtered, groups }
}
