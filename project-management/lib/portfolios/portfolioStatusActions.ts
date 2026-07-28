/**
 * Portfolio status update mutations — persist, sync pill, notify members.
 */
import { createNotification } from '../notifications'
import { newId } from '../ids'
import { now } from '../time'
import { STATUS_LABELS } from '../../features/projects/projectUtils'
import type { ProjectStatus, StatusUpdate } from '../../types'
import {
  usePortfoliosStore,
  useProjectsStore,
  useStatusUpdatesStore,
  useUsersStore,
} from '../../stores/entities'
import { updatePortfolio } from './portfolioActions'

export type PostPortfolioStatusUpdateInput = {
  portfolioId: string
  authorId: string
  status: Exclude<ProjectStatus, null>
  title: string
  summaryHtml: string
  highlightsHtml?: string
  blockersHtml?: string
  nextStepsHtml?: string
}

/** Collect unique member ids from all linked projects. */
function portfolioMemberIds(portfolioId: string): string[] {
  const portfolio = usePortfoliosStore.getState().getById(portfolioId)
  if (!portfolio) return []
  const ids = new Set<string>([portfolio.ownerId])
  portfolio.projectIds.forEach((pid) => {
    const project = useProjectsStore.getState().getById(pid)
    project?.memberIds.forEach((id) => ids.add(id))
  })
  return [...ids]
}

/** Create a portfolio-scoped status update and notify stakeholders. */
export async function postPortfolioStatusUpdate(
  input: PostPortfolioStatusUpdateInput
): Promise<StatusUpdate> {
  const update: StatusUpdate = {
    id: newId(),
    scope: { type: 'portfolio', id: input.portfolioId },
    authorId: input.authorId,
    status: input.status,
    title: input.title.trim(),
    summaryHtml: input.summaryHtml,
    highlightsHtml: input.highlightsHtml,
    blockersHtml: input.blockersHtml,
    nextStepsHtml: input.nextStepsHtml,
    createdAt: now(),
  }

  await useStatusUpdatesStore.getState().add(update)
  await updatePortfolio(input.portfolioId, { status: input.status })

  const portfolio = usePortfoliosStore.getState().getById(input.portfolioId)
  const actor = useUsersStore.getState().getById(input.authorId)
  const statusLabel = STATUS_LABELS[input.status]

  await Promise.all(
    portfolioMemberIds(input.portfolioId)
      .filter((id) => id !== input.authorId)
      .map((userId) =>
        createNotification({
          userId,
          actorId: input.authorId,
          type: 'status_update',
          scope: { type: 'portfolio', id: input.portfolioId },
          message: `${actor?.name ?? 'Someone'} posted a status update: ${statusLabel} on ${portfolio?.name ?? 'portfolio'}`,
          metadata: { updateId: update.id, statusLabel, subtype: 'portfolio_status_update' },
        })
      )
  )

  return update
}
