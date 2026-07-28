/**
 * Portfolios home list filters — owner, status, time period, search.
 */
import { isBefore, parseISO, subDays } from 'date-fns'
import type { Portfolio, ProjectStatus } from '../../types'
import type { EnrichedPortfolio } from './types'
import { computePortfolioHealth } from '../../features/portfolios/portfolioHealth'
import type { Project, Task } from '../../types'

export type PortfolioListFilters = {
  search: string
  ownerId: string | 'all'
  status: ProjectStatus | 'all'
  timePeriod: 'all' | '30d' | '90d'
}

export const DEFAULT_PORTFOLIO_FILTERS: PortfolioListFilters = {
  search: '',
  ownerId: 'all',
  status: 'all',
  timePeriod: 'all',
}

/** Apply home-page filters to portfolio rows. */
export function filterPortfolios(
  portfolios: EnrichedPortfolio[],
  filters: PortfolioListFilters,
  projects: Project[],
  tasks: Task[]
): EnrichedPortfolio[] {
  const q = filters.search.trim().toLowerCase()
  const cutoff =
    filters.timePeriod === '30d'
      ? subDays(new Date(), 30)
      : filters.timePeriod === '90d'
        ? subDays(new Date(), 90)
        : null

  return portfolios.filter((p) => {
    if (filters.ownerId !== 'all' && p.ownerId !== filters.ownerId) return false
    if (cutoff && isBefore(parseISO(p.createdAt), cutoff)) return false
    if (filters.status !== 'all') {
      const health = computePortfolioHealth(p, projects, tasks)
      const inferred = health.inferredStatus ?? 'on_track'
      if (inferred !== filters.status) return false
    }
    if (q) {
      const hay = `${p.name} ${p.description ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}
