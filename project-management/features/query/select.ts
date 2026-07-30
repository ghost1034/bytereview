/**
 * Memoized selector for filtered, sorted, and grouped task lists.
 */
import type { Task } from '../../types'
import { applyViewQueryGrouped, type ApplyQueryContext, type TaskGroup, type ViewQuery } from '../../lib/query/applyQuery'

export type GroupedTaskResult = {
  tasks: Task[]
  groups: TaskGroup[]
}

/** Pure selector — memoize at call site with useMemo on [tasks, query, ctx]. */
export function selectGroupedTasks(
  tasks: Task[],
  query: ViewQuery,
  ctx: ApplyQueryContext
): GroupedTaskResult {
  return applyViewQueryGrouped(tasks, query, ctx)
}

/** Shallow compare filters/sort/group for memoization keys. */
export function viewQueryMemoKey(query: ViewQuery): string {
  return JSON.stringify({
    filters: query.filters,
    sortBy: query.sortBy ?? query.sort,
    groupBy: query.groupBy,
    hiddenFields: query.hiddenFields,
    showCompleted: query.showCompleted,
    hiddenCompleted: query.hiddenCompleted,
    density: query.density,
    swimlaneBy: query.swimlaneBy,
    boardSwimlanes: query.boardSwimlanes,
    collapsedSectionIds: query.collapsedSectionIds,
    search: query.search,
  })
}
