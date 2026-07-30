/**
 * Scope filtering — narrow tasks/projects/portfolios/goals before chart aggregation.
 */
import type { Goal, Portfolio, Project, SavedView, Task } from '../../types'
import { applyFilters } from '../query/filterMatch'
import type { ApplyQueryContext, FilterClause } from '../query/types'
import type { ChartScope } from './types'

type ScopeContext = {
  scope: ChartScope
  workspaceId: string
  projects: Project[]
  portfolios: Portfolio[]
  savedViews: SavedView[]
  queryCtx: ApplyQueryContext
}

function projectIdsForScope(ctx: ScopeContext): Set<string> | null {
  const { scope, projects, portfolios, savedViews } = ctx
  if (scope.type === 'workspace') return null
  if (scope.type === 'project') return new Set([scope.id])
  if (scope.type === 'team') {
    return new Set(projects.filter((p) => p.teamId === scope.id).map((p) => p.id))
  }
  if (scope.type === 'portfolio') {
    const pf = portfolios.find((p) => p.id === scope.id)
    return pf ? new Set(pf.projectIds) : new Set()
  }
  if (scope.type === 'view') {
    const view = savedViews.find((v) => v.id === scope.id)
    if (!view) return new Set()
    if (view.ownerScope.type === 'project') return new Set([view.ownerScope.id])
    const pf = portfolios.find((p) => p.id === view.ownerScope.id)
    return pf ? new Set(pf.projectIds) : new Set()
  }
  return null
}

/** Filter tasks by chart scope and clauses. */
export function scopedTasks(tasks: Task[], filters: FilterClause[], ctx: ScopeContext): Task[] {
  const ws = tasks.filter((t) => t.workspaceId === ctx.workspaceId)
  const ids = projectIdsForScope(ctx)
  let scoped = ids ? ws.filter((t) => t.projectIds.some((id) => ids.has(id))) : ws
  if (ctx.scope.type === 'view') {
    const viewId = ctx.scope.id
    const view = ctx.savedViews.find((v) => v.id === viewId)
    if (view) {
      scoped = applyFilters(scoped, view.filters as FilterClause[], {
        ...ctx.queryCtx,
        projectId: view.ownerScope.type === 'project' ? view.ownerScope.id : ctx.queryCtx.projectId,
      })
    }
  }
  return applyFilters(scoped, filters, ctx.queryCtx)
}

export function scopedProjects(projects: Project[], ctx: ScopeContext): Project[] {
  const ws = projects.filter((p) => p.workspaceId === ctx.workspaceId && !p.archived)
  const ids = projectIdsForScope(ctx)
  if (!ids) return ws
  return ws.filter((p) => ids.has(p.id))
}

export function scopedPortfolios(portfolios: Portfolio[], ctx: ScopeContext): Portfolio[] {
  return portfolios.filter((p) => p.workspaceId === ctx.workspaceId)
}

export function scopedGoals(goals: Goal[], ctx: ScopeContext): Goal[] {
  return goals.filter((g) => g.workspaceId === ctx.workspaceId)
}
