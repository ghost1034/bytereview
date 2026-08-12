import type { FilterClause, FilterExpression, FilterGroup, ViewQuery } from './types'

let expressionId = 0

export function newFilterExpressionId(prefix = 'filter'): string {
  expressionId += 1
  return `${prefix}-${expressionId}`
}

export function isFilterGroup(value: FilterExpression): value is FilterGroup {
  return value.type === 'group'
}

export function clauseCount(expression: FilterExpression | undefined): number {
  if (!expression) return 0
  if (!isFilterGroup(expression)) return 1
  return expression.children.reduce((count, child) => count + clauseCount(child), 0)
}

/** Wrap legacy FilterClause[] in a top-level AND group without mutating persisted data. */
export function migrateLegacyFilters(filters: FilterClause[] | undefined): FilterGroup {
  return {
    type: 'group',
    id: newFilterExpressionId('group'),
    operator: 'and',
    children: (filters ?? []).map((clause) => ({
      ...clause,
      type: 'clause' as const,
      id: clause.id ?? newFilterExpressionId('clause'),
    })),
  }
}

export function resolveFilterExpression(query: Pick<ViewQuery, 'filters' | 'filterExpression'>): FilterGroup {
  return query.filterExpression ?? migrateLegacyFilters(query.filters)
}

/** Materialize the canonical recursive tree the first time a legacy query is edited/saved. */
export function migrateViewQuery(query: ViewQuery): ViewQuery {
  if (query.filterExpression) return query
  return { ...query, filterExpression: migrateLegacyFilters(query.filters), filters: [] }
}

export function matchFilterExpression(
  expression: FilterExpression,
  matchClause: (clause: FilterClause) => boolean,
): boolean {
  if (!isFilterGroup(expression)) return matchClause(expression)
  if (!expression.children.length) return true
  return expression.operator === 'and'
    ? expression.children.every((child) => matchFilterExpression(child, matchClause))
    : expression.children.some((child) => matchFilterExpression(child, matchClause))
}

export function updateFilterExpression(
  expression: FilterExpression,
  id: string,
  updater: (node: FilterExpression) => FilterExpression,
): FilterExpression {
  if (expression.id === id) return updater(expression)
  if (!isFilterGroup(expression)) return expression
  return {
    ...expression,
    children: expression.children.map((child) => updateFilterExpression(child, id, updater)),
  }
}

export function removeFilterExpression(expression: FilterGroup, id: string): FilterGroup {
  return {
    ...expression,
    children: expression.children
      .filter((child) => child.id !== id)
      .map((child) => isFilterGroup(child) ? removeFilterExpression(child, id) : child),
  }
}
