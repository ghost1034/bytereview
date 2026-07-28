/**
 * Additive portfolio extensions persisted via the portfolios store.
 */
import type { CustomFieldValue, ID, Portfolio } from '../../types'

/** Optional fields stored on portfolio records (additive to base Portfolio). */
export type PortfolioMeta = {
  iconEmoji?: string
  color?: string
  /** Portfolio-scoped CF values per project: projectId → fieldId → value */
  projectFieldValues?: Record<ID, Record<ID, CustomFieldValue>>
}

export type EnrichedPortfolio = Portfolio & PortfolioMeta

export type PortfolioTab =
  | 'projects'
  | 'progress'
  | 'dashboard'
  | 'workload'
  | 'timeline'
  | 'settings'

export const PORTFOLIO_TABS: { id: PortfolioTab; label: string }[] = [
  { id: 'projects', label: 'Projects' },
  { id: 'progress', label: 'Progress' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'workload', label: 'Workload' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'settings', label: 'Settings' },
]

/** Cast a store portfolio row to include additive meta fields. */
export function asEnriched(portfolio: Portfolio | undefined): EnrichedPortfolio | undefined {
  if (!portfolio) return undefined
  return portfolio as EnrichedPortfolio
}
