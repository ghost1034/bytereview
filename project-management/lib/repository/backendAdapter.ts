/**
 * Production repository adapter — REST fetch to /api/tasklytic/* with Firebase auth.
 * Workspace-scoped entities include ?workspace_id= on each request.
 */
import { tasklyticApiFetch, tasklyticApiJson } from '../tasklyticApi'
import type { ID } from '../../types'
import type { EntityKind, ProvisioningResult, RepositoryAdapter, RepositorySnapshot } from './types'
import {
  getActiveRepositoryWorkspaceId,
  isWorkspaceScopedEntity,
} from './workspaceScope'

const SCHEMA_VERSION = 1

type Listener = (items: unknown[]) => void

const listeners = new Map<EntityKind, Set<Listener>>()
const cache = new Map<EntityKind, unknown[]>()
const snapshotRequests = new Map<string, Promise<RepositorySnapshot>>()

function emit(entity: EntityKind, items: unknown[]): void {
  listeners.get(entity)?.forEach((cb) => cb(items))
}

function entityPath(entity: EntityKind, suffix = ''): string {
  const base = `/${entity}${suffix}`
  if (!isWorkspaceScopedEntity(entity)) return base
  const workspaceId = getActiveRepositoryWorkspaceId()
  if (!workspaceId) return base
  const sep = suffix.includes('?') ? '&' : '?'
  return `${base}${sep}workspace_id=${encodeURIComponent(workspaceId)}`
}

function snapshotKey(workspaceId?: string | null): string {
  return workspaceId || '__global__'
}

function applySnapshot(snapshot: RepositorySnapshot, shouldEmit = false): void {
  const activeWorkspaceId = getActiveRepositoryWorkspaceId()
  const mayEmit = !snapshot.workspaceId || snapshot.workspaceId === activeWorkspaceId
  Object.entries(snapshot.collections).forEach(([kind, rows]) => {
    const entity = kind as EntityKind
    const items = Array.isArray(rows) ? rows : []
    cache.set(entity, items)
    if (shouldEmit && mayEmit) emit(entity, items)
  })
}

async function fetchSnapshot(workspaceId?: string | null, force = false): Promise<RepositorySnapshot> {
  const key = snapshotKey(workspaceId)
  if (force) snapshotRequests.delete(key)
  const existing = snapshotRequests.get(key)
  if (existing) return existing
  const params = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : ''
  const request = tasklyticApiJson<RepositorySnapshot>(`/bootstrap${params}`)
    .then((snapshot) => {
      applySnapshot(snapshot, force)
      return snapshot
    })
    .catch((error) => {
      snapshotRequests.delete(key)
      throw error
    })
  snapshotRequests.set(key, request)
  return request
}

function invalidateSnapshots(): void {
  snapshotRequests.clear()
}

export const backendRepositoryAdapter: RepositoryAdapter = {
  schemaVersion: SCHEMA_VERSION,

  async migrateIfNeeded(): Promise<void> {
    /* server owns schema migrations via Alembic */
  },

  async loadAll<T>(entity: EntityKind): Promise<T[]> {
    if (isWorkspaceScopedEntity(entity) && !getActiveRepositoryWorkspaceId()) {
      cache.set(entity, [])
      return []
    }
    const workspaceId = isWorkspaceScopedEntity(entity) ? getActiveRepositoryWorkspaceId() : null
    const snapshot = await fetchSnapshot(workspaceId)
    return (snapshot.collections[entity] ?? []) as T[]
  },

  async saveAll<T>(entity: EntityKind, items: T[]): Promise<void> {
    await tasklyticApiJson(entityPath(entity), { method: 'PUT', body: JSON.stringify(items) })
    invalidateSnapshots()
    cache.set(entity, items)
    emit(entity, items)
  },

  async upsertOne<T extends { id: ID }>(entity: EntityKind, item: T): Promise<void> {
    await tasklyticApiJson(entityPath(entity, `/${item.id}`), {
      method: 'PUT',
      body: JSON.stringify(item),
    })
    invalidateSnapshots()
    const items = (cache.get(entity) ?? []) as T[]
    const idx = items.findIndex((i) => i.id === item.id)
    if (idx >= 0) items[idx] = item
    else items.push(item)
    cache.set(entity, items)
    emit(entity, items)
  },

  async removeOne(entity: EntityKind, id: ID): Promise<void> {
    const response = await tasklyticApiFetch(entityPath(entity, `/${id}`), { method: 'DELETE' })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body?.detail || `Tasklytic delete failed (${response.status})`)
    }
    invalidateSnapshots()
    const items = (cache.get(entity) ?? []).filter((i) => (i as { id: ID }).id !== id)
    cache.set(entity, items)
    emit(entity, items)
  },

  async clearAll(): Promise<void> {
    await tasklyticApiJson('/clear', { method: 'POST' })
    invalidateSnapshots()
    cache.clear()
    listeners.forEach((_, entity) => emit(entity, []))
  },

  subscribe(entity: EntityKind, cb: (items: unknown[]) => void): () => void {
    if (!listeners.has(entity)) listeners.set(entity, new Set())
    listeners.get(entity)!.add(cb)
    return () => listeners.get(entity)?.delete(cb)
  },

  async refreshSnapshot(workspaceId?: ID | null): Promise<RepositorySnapshot> {
    return fetchSnapshot(workspaceId ?? getActiveRepositoryWorkspaceId(), true)
  },

  async provision(bundle: unknown): Promise<ProvisioningResult> {
    const result = await tasklyticApiJson<ProvisioningResult>('/provision', {
      method: 'POST',
      body: JSON.stringify({ bundle }),
    })
    invalidateSnapshots()
    applySnapshot(result.bootstrap, true)
    snapshotRequests.set(snapshotKey(result.bootstrap.workspaceId), Promise.resolve(result.bootstrap))
    return result
  },
}
