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
import type { ID } from '../../../types'

export function usePsaContext(workspaceId: ID, userId: ID, projectId?: ID, matterId?: ID, clientId?: ID) {
  const user = useUsersStore((s) => s.getById(userId))
  const workspace = useWorkspacesStore((s) => s.getById(workspaceId))
  const project = useProjectsStore((s) => projectId ? s.getById(projectId) : undefined)
  const matter = useMattersStore((s) => matterId ? s.getById(matterId) : undefined)
  const billingRates = useBillingRatesStore((s) => s.list())
  const rateCards = useRateCardsStore((s) => s.list())
  const clients = useClientsStore((s) => s.list().filter((c) => c.workspaceId === workspaceId && !c.archived))
  const matters = useMattersStore((s) => s.list().filter((m) => m.workspaceId === workspaceId))

  const resolvedClientId = clientId ?? matter?.clientId ?? project?.clientId
  const client = clients.find((candidate) => candidate.id === resolvedClientId)

  const rate = useMemo(
    () =>
      resolveRate({
        workspaceId,
        userId,
        user,
        matterId,
        projectId,
        clientId: resolvedClientId,
        client,
        matter,
        project,
        billingRates,
        rateCards,
        defaultCurrency: workspace?.defaultCurrency,
      }),
    [workspaceId, userId, user, matterId, projectId, resolvedClientId, client, matter, project, billingRates, rateCards, workspace]
  )

  return { user, workspace, project, matter, clients, matters, rate, resolvedClientId }
}
