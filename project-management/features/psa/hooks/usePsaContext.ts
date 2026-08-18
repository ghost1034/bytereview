'use client'

/** Hook: resolve billing context for PSA forms. */
import { useMemo } from 'react'
import {
  useBillingRatesStore,
  useClientsStore,
  useMattersStore,
  useProjectsStore,
  useRateCardsStore,
  useUsersStore,
  useWorkspacesStore,
} from '../../../stores/entities'
import { resolveRate } from '../../../lib/billing/resolveRate'
import { resolveLinkedMatter } from '../../../lib/psa/resolvePsaLinks'
import type { ID } from '../../../types'

export function usePsaContext(workspaceId: ID, userId: ID, projectId?: ID, matterId?: ID, clientId?: ID, date?: string) {
  const user = useUsersStore((s) => s.getById(userId))
  const workspace = useWorkspacesStore((s) => s.getById(workspaceId))
  const project = useProjectsStore((s) => projectId ? s.getById(projectId) : undefined)
  const billingRates = useBillingRatesStore((s) => s.list())
  const rateCards = useRateCardsStore((s) => s.list())
  const clients = useClientsStore((s) => s.list().filter((c) => c.workspaceId === workspaceId && !c.archived))
  const matters = useMattersStore((s) => s.list().filter((m) => m.workspaceId === workspaceId))
  const matter = resolveLinkedMatter(matters, project, matterId)

  const resolvedClientId = clientId ?? matter?.clientId ?? project?.clientId
  const resolvedMatterId = matter?.id
  const client = clients.find((candidate) => candidate.id === resolvedClientId)

  const rate = useMemo(
    () =>
      resolveRate({
        workspaceId,
        userId,
        user,
        matterId: resolvedMatterId,
        projectId,
        clientId: resolvedClientId,
        date,
        client,
        matter,
        project,
        billingRates,
        rateCards,
        defaultCurrency: workspace?.defaultCurrency,
      }),
    [workspaceId, userId, user, resolvedMatterId, projectId, resolvedClientId, date, client, matter, project, billingRates, rateCards, workspace]
  )

  return { user, workspace, project, matter, client, clients, matters, rate, resolvedMatterId, resolvedClientId }
}
