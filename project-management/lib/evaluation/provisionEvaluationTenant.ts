/**
 * Provision or reset an evaluation tenant via the unified provisioning engine.
 */
import { provisionPlan } from '../provisioning'
import { setRepositoryPartition } from '../repository/partition'
import { now } from '../time'
import type { ID } from '../../types'
import { useAuthStore, useUiStore } from '../../stores/auth'
import { rehydrateEntityStores } from '../../stores/hydrate'
import { useProjectsStore, useTasksStore } from '../../stores/entities'
import { setEvalTenantMeta } from './evaluationMetaStore'
import { EVALUATION_TENANTS, getEvaluationTenant, type EvaluationTenantId } from './tenantCatalog'

export type ProvisionEvalResult = {
  workspaceId: ID
  ownerId: ID
}

/** Wipe eval partition and provision a single tenant deterministically. */
export async function provisionEvaluationTenant(tenantId: EvaluationTenantId): Promise<ProvisionEvalResult> {
  const def = getEvaluationTenant(tenantId)
  if (!def) throw new Error(`Unknown evaluation tenant: ${tenantId}`)

  setRepositoryPartition(`eval:${tenantId}`)
  await useAuthStore.getState().hydrate()
  await rehydrateEntityStores()

  const ownerId = crypto.randomUUID()
  const plan = def.buildPlan(ownerId)
  const result = await provisionPlan(plan, { seedRng: def.seed })

  const projectCount = useProjectsStore.getState().list().filter((p) => p.workspaceId === result.workspaceId).length
  const taskCount = useTasksStore.getState().list().filter((t) => t.workspaceId === result.workspaceId).length

  setEvalTenantMeta(tenantId, {
    workspaceId: result.workspaceId,
    lastProvisionedAt: now(),
    projectCount,
    taskCount,
  })

  await useAuthStore.getState().setCurrentUser(ownerId, { partition: `eval:${tenantId}` })
  useUiStore.getState().setActiveWorkspaceId(result.workspaceId)

  return { workspaceId: result.workspaceId, ownerId }
}

/** Provision all seven evaluation tenants sequentially (metadata only for last switched). */
export async function provisionAllEvaluationTenants(): Promise<void> {
  for (const def of EVALUATION_TENANTS) {
    await provisionEvaluationTenant(def.id)
  }
}

export { EVALUATION_TENANTS, type EvaluationTenantId }
