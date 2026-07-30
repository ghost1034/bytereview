/**
 * Portfolio mutations — membership, ordering, and metadata updates.
 */
import { usePortfoliosStore } from '../../stores/entities'
import type { ID } from '../../types'
import type { EnrichedPortfolio } from './types'

/** Patch a portfolio record in the store. */
export async function updatePortfolio(
  id: ID,
  patch: Partial<EnrichedPortfolio>
): Promise<void> {
  await usePortfoliosStore.getState().update(id, patch as Partial<EnrichedPortfolio>)
}

/** Append projects to a portfolio (deduped). */
export async function addProjectsToPortfolio(portfolioId: ID, projectIds: ID[]): Promise<void> {
  const portfolio = usePortfoliosStore.getState().getById(portfolioId)
  if (!portfolio || !projectIds.length) return
  const merged = [...new Set([...portfolio.projectIds, ...projectIds])]
  await updatePortfolio(portfolioId, { projectIds: merged })
}

/** Remove one project from a portfolio. */
export async function removeProjectFromPortfolio(portfolioId: ID, projectId: ID): Promise<void> {
  const portfolio = usePortfoliosStore.getState().getById(portfolioId)
  if (!portfolio) return
  await updatePortfolio(portfolioId, {
    projectIds: portfolio.projectIds.filter((id) => id !== projectId),
  })
}

/** Bulk-remove projects from a portfolio. */
export async function removeProjectsFromPortfolio(portfolioId: ID, projectIds: ID[]): Promise<void> {
  const portfolio = usePortfoliosStore.getState().getById(portfolioId)
  if (!portfolio) return
  const drop = new Set(projectIds)
  await updatePortfolio(portfolioId, {
    projectIds: portfolio.projectIds.filter((id) => !drop.has(id)),
  })
}

/** Persist drag-reorder of portfolio project rows. */
export async function reorderPortfolioProjects(portfolioId: ID, projectIds: ID[]): Promise<void> {
  await updatePortfolio(portfolioId, { projectIds })
}

/** Link goals to a portfolio. */
export async function setPortfolioGoals(portfolioId: ID, goalIds: ID[]): Promise<void> {
  await updatePortfolio(portfolioId, { goalIds })
}

/** Attach custom field definitions to a portfolio. */
export async function setPortfolioCustomFieldIds(portfolioId: ID, customFieldIds: ID[]): Promise<void> {
  await updatePortfolio(portfolioId, { customFieldIds })
}
