import { backendRepositoryAdapter } from './backendAdapter'
import { localRepositoryAdapter } from './localAdapter'
import {
  resolveTasklyticPersistenceMode,
  type TasklyticPersistenceMode,
} from '../runtimeMode'
import type { RepositoryAdapter } from './types'

let cached: RepositoryAdapter | null = null

export function selectTasklyticRepository(
  mode: TasklyticPersistenceMode,
): RepositoryAdapter {
  return mode === 'backend' ? backendRepositoryAdapter : localRepositoryAdapter
}

/** Returns REST for customer use; localStorage is test/evaluation-only. */
export function getRepository(): RepositoryAdapter {
  if (cached) return cached
  cached = selectTasklyticRepository(resolveTasklyticPersistenceMode())
  return cached
}

export type { EntityKind, ProvisioningResult, RepositoryAdapter, RepositorySnapshot } from './types'
