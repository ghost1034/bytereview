/**
 * Read/write portfolio-scoped custom field values per project.
 */
import type { CustomFieldValue, ID } from '../../types'
import { usePortfoliosStore } from '../../stores/entities'
import { asEnriched } from './types'
import { updatePortfolio } from './portfolioActions'

/** Get a portfolio CF value for a specific project row. */
export function getPortfolioProjectFieldValue(
  portfolioId: ID,
  projectId: ID,
  fieldId: ID
): CustomFieldValue | undefined {
  const portfolio = asEnriched(usePortfoliosStore.getState().getById(portfolioId))
  return portfolio?.projectFieldValues?.[projectId]?.[fieldId]
}

/** Persist a portfolio CF value for a project row. */
export async function setPortfolioProjectFieldValue(
  portfolioId: ID,
  projectId: ID,
  fieldId: ID,
  value: CustomFieldValue
): Promise<void> {
  const portfolio = asEnriched(usePortfoliosStore.getState().getById(portfolioId))
  if (!portfolio) return
  const projectFieldValues = { ...(portfolio.projectFieldValues ?? {}) }
  projectFieldValues[projectId] = { ...(projectFieldValues[projectId] ?? {}), [fieldId]: value }
  await updatePortfolio(portfolioId, { projectFieldValues })
}
