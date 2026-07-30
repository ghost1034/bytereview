import { backendRepositoryAdapter } from './backendAdapter'
import { localRepositoryAdapter } from './localAdapter'
import type { RepositoryAdapter } from './types'

let cached: RepositoryAdapter | null = null

/** Returns the configured repository adapter (V1: localStorage; production: REST). */
export function getRepository(): RepositoryAdapter {
  if (cached) return cached
  const useBackend =
    typeof process !== 'undefined' &&
    process.env.NEXT_PUBLIC_TASKLYTIC_BACKEND === '1'
  cached = useBackend ? backendRepositoryAdapter : localRepositoryAdapter
  return cached
}

export type { EntityKind, ProvisioningResult, RepositoryAdapter, RepositorySnapshot } from './types'
