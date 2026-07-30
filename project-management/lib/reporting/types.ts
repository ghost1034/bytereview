import type { Chart, Dashboard, ISODateTime, SavedView } from '../../types'
import type { FilterClause } from '../query/types'

/** Digest recurrence stored additively on dashboard rows. */
export type DashboardSchedule = {
  frequency: 'daily' | 'weekly_mon' | 'monthly_1st'
  recipients: string[]
  nextRunAt: ISODateTime
}

/** Dashboard visibility for sharing UI. */
export type DashboardVisibility = 'private' | 'people' | 'workspace'

/** Runtime extensions for dashboards — persisted via store, additive to base model. */
export type ReportingDashboard = Dashboard & {
  updatedAt?: ISODateTime
  visibility?: DashboardVisibility
  schedule?: DashboardSchedule
  tags?: string[]
}

/** Scope applied before chart filters. */
export type ChartScope =
  | { type: 'workspace' }
  | { type: 'portfolio'; id: string }
  | { type: 'team'; id: string }
  | { type: 'project'; id: string }
  | { type: 'view'; id: string }

export type ChartPoint = {
  key: string
  label: string
  value: number
  recordIds: string[]
  color?: string
}

export type BurnupPoint = {
  date: string
  label: string
  total: number
  completed: number
  recordIds: string[]
}

export type TimeSeriesPoint = { x: string; label: string; y: number; recordIds: string[] }

export type ChartComputed =
  | { kind: 'categorical'; points: ChartPoint[]; total: number }
  | { kind: 'number'; value: number; subtitle: string; recordIds: string[] }
  | { kind: 'burnup'; points: BurnupPoint[] }
  | { kind: 'timeseries'; points: TimeSeriesPoint[] }

export type ChartBuilderDraft = Omit<Chart, 'id'> & {
  scope: ChartScope
  granularity?: 'day' | 'week' | 'month' | 'quarter'
  dateField?: string
  topN?: number
}

export const SCOPE_FILTER_FIELD = '__scope'

/** Split scope meta-filter from user-facing chart filters. */
export function splitScopeFromFilters(filters: SavedView['filters']): {
  scope: ChartScope
  filters: FilterClause[]
} {
  const scopeClause = filters.find((f) => f.field === SCOPE_FILTER_FIELD)
  const rest = filters.filter((f) => f.field !== SCOPE_FILTER_FIELD) as FilterClause[]
  const raw = scopeClause?.value as ChartScope | undefined
  return { scope: raw ?? { type: 'workspace' }, filters: rest }
}

/** Encode scope into chart filters for persistence. */
export function encodeScopeFilter(scope: ChartScope, filters: FilterClause[]): FilterClause[] {
  return [{ field: SCOPE_FILTER_FIELD, op: 'eq', value: scope }, ...filters]
}
