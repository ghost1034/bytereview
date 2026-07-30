/**
 * Dashboard CRUD helpers — create, duplicate, layout defaults.
 */
import { newId } from '../ids'
import { now } from '../time'
import type { Chart, Dashboard } from '../../types'
import type { FilterClause } from '../query/types'
import { encodeScopeFilter } from './types'
import type { ChartScope, ReportingDashboard } from './types'

const DEFAULT_W = 4
const DEFAULT_H = 3

/** Create an empty dashboard row for the workspace. */
export function buildEmptyDashboard(workspaceId: string, ownerId: string, name: string): ReportingDashboard {
  return {
    id: newId(),
    workspaceId,
    name,
    ownerId,
    charts: [],
    layout: [],
    sharedWith: [],
    createdAt: now(),
    updatedAt: now(),
    visibility: 'private',
    tags: [],
  }
}

/** Append a chart and layout tile at the next open grid row. */
export function appendChartToDashboard(
  dashboard: ReportingDashboard,
  chart: Chart
): Pick<ReportingDashboard, 'charts' | 'layout' | 'updatedAt'> {
  const maxY = dashboard.layout.reduce((m, l) => Math.max(m, l.y + l.h), 0)
  return {
    charts: [...dashboard.charts, chart],
    layout: [...dashboard.layout, { chartId: chart.id, x: 0, y: maxY, w: DEFAULT_W, h: DEFAULT_H }],
    updatedAt: now(),
  }
}

/** Duplicate dashboard with fresh ids. */
export function duplicateDashboard(dashboard: ReportingDashboard, ownerId: string): ReportingDashboard {
  const idMap = new Map<string, string>()
  const charts = dashboard.charts.map((c) => {
    const id = newId()
    idMap.set(c.id, id)
    return { ...c, id }
  })
  return {
    ...dashboard,
    id: newId(),
    name: `${dashboard.name} (copy)`,
    ownerId,
    charts,
    layout: dashboard.layout.map((l) => ({ ...l, chartId: idMap.get(l.chartId) ?? newId() })),
    sharedWith: [],
    schedule: undefined,
    createdAt: now(),
    updatedAt: now(),
  }
}

/** Instantiate charts from template definitions. */
export function chartsFromTemplate(defs: Array<Omit<Chart, 'id'> & { scope: ChartScope }>): Chart[] {
  return defs.map((def) => {
    const { scope, ...rest } = def
    return { ...rest, id: newId(), filters: encodeScopeFilter(scope, rest.filters as FilterClause[]) }
  })
}

export function layoutForCharts(charts: Chart[]): Dashboard['layout'] {
  return charts.map((chart, index) => ({
    chartId: chart.id,
    x: (index % 3) * DEFAULT_W,
    y: Math.floor(index / 3) * DEFAULT_H,
    w: DEFAULT_W,
    h: DEFAULT_H,
  }))
}
