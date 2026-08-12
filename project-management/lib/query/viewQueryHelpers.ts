/**
 * ViewQuery normalization helpers for legacy + new field names.
 */
import type { ViewQuery } from './types'
import { clauseCount, resolveFilterExpression } from './filterExpression'

/** Whether completed tasks should appear in results. */
export function resolvesShowCompleted(query: ViewQuery): boolean {
  if (query.hiddenCompleted !== undefined) return !query.hiddenCompleted
  return query.showCompleted
}

/** Effective sort descriptor (sortBy preferred over legacy sort). */
export function resolveSort(query: ViewQuery): ViewQuery['sortBy'] {
  return query.sortBy ?? query.sort
}

/** Whether board swimlanes by assignee are enabled. */
export function resolvesSwimlanes(query: ViewQuery): boolean {
  if (query.swimlaneBy) return query.swimlaneBy === 'assignee'
  return query.boardSwimlanes ?? false
}

/** Merge partial updates while keeping legacy fields in sync. */
export function patchViewQuery(current: ViewQuery, patch: Partial<ViewQuery>): ViewQuery {
  const next: ViewQuery = { ...current, ...patch }
  if (patch.showCompleted !== undefined) {
    next.hiddenCompleted = !patch.showCompleted
  }
  if (patch.hiddenCompleted !== undefined) {
    next.showCompleted = !patch.hiddenCompleted
  }
  if (patch.sortBy !== undefined) {
    next.sort = patch.sortBy
  }
  if (patch.sort !== undefined) {
    next.sortBy = patch.sort
  }
  if (patch.swimlaneBy !== undefined) {
    next.boardSwimlanes = patch.swimlaneBy === 'assignee'
  }
  if (patch.boardSwimlanes !== undefined) {
    next.swimlaneBy = patch.boardSwimlanes ? 'assignee' : undefined
  }
  return next
}

/** True when query differs from defaults (excluding ephemeral search). */
export function isQueryModified(query: ViewQuery, baseline: ViewQuery = { filters: [], hiddenFields: [], showCompleted: true, density: 'comfortable', collapsedSectionIds: [], search: '' }): boolean {
  return (
    clauseCount(resolveFilterExpression(query)) > 0 ||
    !!resolveSort(query) ||
    (query.groupBy !== undefined && query.groupBy !== 'none') ||
    query.hiddenFields.length > 0 ||
    !resolvesShowCompleted(query) ||
    query.density !== baseline.density ||
    (query.collapsedSectionIds?.length ?? 0) > 0
  )
}
