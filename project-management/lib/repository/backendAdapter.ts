/**
 * Production repository adapter — revision-checked REST plus workspace SSE.
 */
import { requiredCapabilityForMutation, TasklyticForbiddenError } from '../authorization'
import { reportRevisionConflict, RevisionConflictError } from '../concurrency'
import { TasklyticApiError, tasklyticApiJson } from '../tasklyticApi'
import { connectWorkspaceEventStream } from '../workspaceEvents'
import type { ID } from '../../types'
import type {
  EntityKind,
  ProvisioningResult,
  RepositoryAdapter,
  RepositorySnapshot,
  IdentifiedRevisionedRecord,
  RevisionedRecord,
  TasklyticCapabilities,
} from './types'
import {
  getActiveRepositoryWorkspaceId,
  isWorkspaceScopedEntity,
  USER_PRIVATE_ENTITY_KINDS,
} from './workspaceScope'

const SCHEMA_VERSION = 2

type Listener = (items: unknown[]) => void

const listeners = new Map<EntityKind, Set<Listener>>()
const cache = new Map<EntityKind, unknown[]>()
const snapshotRequests = new Map<string, Promise<RepositorySnapshot>>()
const workspaceCapabilities = new Map<string, TasklyticCapabilities>()

function emit(entity: EntityKind, items: unknown[]): void {
  listeners.get(entity)?.forEach((cb) => cb(items))
}

function entityPath(entity: EntityKind, suffix = ''): string {
  const base = `/${entity}${suffix}`
  if (!isWorkspaceScopedEntity(entity)) return base
  const workspaceId = getActiveRepositoryWorkspaceId()
  if (!workspaceId) return base
  const separator = suffix.includes('?') ? '&' : '?'
  return `${base}${separator}workspace_id=${encodeURIComponent(workspaceId)}`
}

function snapshotKey(workspaceId?: string | null): string {
  return workspaceId || '__global__'
}

function applySnapshot(snapshot: RepositorySnapshot, shouldEmit = false): void {
  const activeWorkspaceId = getActiveRepositoryWorkspaceId()
  const mayEmit = !snapshot.workspaceId || snapshot.workspaceId === activeWorkspaceId
  if (snapshot.workspaceId && snapshot.capabilities) {
    workspaceCapabilities.set(snapshot.workspaceId, snapshot.capabilities)
  }
  Object.entries(snapshot.collections).forEach(([kind, rows]) => {
    const entity = kind as EntityKind
    const items = Array.isArray(rows) ? rows : []
    cache.set(entity, items)
    if (shouldEmit && mayEmit) emit(entity, items)
  })
}

async function fetchSnapshot(
  workspaceId?: string | null,
  force = false,
): Promise<RepositorySnapshot> {
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

function assertMutationCapability(
  entity: EntityKind,
  next: RevisionedRecord,
  previous?: RevisionedRecord,
): void {
  if (USER_PRIVATE_ENTITY_KINDS.has(entity)) return
  const workspaceId = getActiveRepositoryWorkspaceId()
  const capabilities = workspaceId ? workspaceCapabilities.get(workspaceId) : undefined
  const required = requiredCapabilityForMutation(entity, next as { status?: unknown }, previous as { status?: unknown })
  if (capabilities && !capabilities[required]) throw new TasklyticForbiddenError(required)
}

function conflictFromError(
  error: unknown,
  entity: EntityKind,
  attempted: RevisionedRecord,
): RevisionConflictError | null {
  if (!(error instanceof TasklyticApiError) || error.status !== 409) return null
  const detail = error.detail as { code?: string; current?: RevisionedRecord } | undefined
  if (detail?.code !== 'revision_conflict' || !detail.current) return null
  const conflict = { entity, attempted, current: detail.current }
  reportRevisionConflict(conflict)
  return new RevisionConflictError(conflict)
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
    const workspaceId = isWorkspaceScopedEntity(entity)
      ? getActiveRepositoryWorkspaceId()
      : null
    const snapshot = await fetchSnapshot(workspaceId)
    return (snapshot.collections[entity] ?? []) as T[]
  },

  async saveAll<T extends RevisionedRecord>(entity: EntityKind, items: T[]): Promise<T[]> {
    if (entity === 'session') {
      const saved: T[] = []
      for (const item of items) {
        saved.push(await backendRepositoryAdapter.upsertOne(
          entity,
          { ...item, id: 'session' } as T & IdentifiedRevisionedRecord,
        ))
      }
      return saved
    }
    const previous = (cache.get(entity) ?? []) as T[]
    const wantedIds = new Set(items.map((item) => item.id).filter(Boolean))
    for (const current of previous) {
      if (!wantedIds.has(current.id)) {
        if (current.id) await backendRepositoryAdapter.removeOne(entity, current.id)
      }
    }
    const saved: T[] = []
    for (const item of items) {
      saved.push(await backendRepositoryAdapter.upsertOne(entity, item as T & IdentifiedRevisionedRecord))
    }
    return saved
  },

  async upsertOne<T extends IdentifiedRevisionedRecord>(entity: EntityKind, item: T): Promise<T> {
    const items = (cache.get(entity) ?? []) as T[]
    const previous = items.find((candidate) => candidate.id === item.id)
    assertMutationCapability(entity, item, previous)
    const revision = item.revision ?? previous?.revision
    try {
      const saved = await tasklyticApiJson<T>(entityPath(entity, `/${item.id}`), {
        method: 'PUT',
        headers: revision ? { 'If-Match': `"${revision}"` } : undefined,
        body: JSON.stringify(item),
      })
      invalidateSnapshots()
      const nextItems = [...items]
      const index = nextItems.findIndex((candidate) => candidate.id === item.id)
      if (index >= 0) nextItems[index] = saved
      else nextItems.push(saved)
      cache.set(entity, nextItems)
      emit(entity, nextItems)
      return saved
    } catch (error) {
      throw conflictFromError(error, entity, item) ?? error
    }
  },

  async removeOne(entity: EntityKind, id: ID): Promise<void> {
    const current = (cache.get(entity) ?? []).find(
      (item) => (item as RevisionedRecord).id === id,
    ) as RevisionedRecord | undefined
    if (!current?.revision) throw new Error('Reload this record before deleting it')
    assertMutationCapability(entity, current, current)
    try {
      await tasklyticApiJson<void>(entityPath(entity, `/${id}`), {
        method: 'DELETE',
        headers: { 'If-Match': `"${current.revision}"` },
      })
    } catch (error) {
      throw conflictFromError(error, entity, current) ?? error
    }
    invalidateSnapshots()
    const items = (cache.get(entity) ?? []).filter(
      (item) => (item as RevisionedRecord).id !== id,
    )
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

  connectWorkspaceEvents(workspaceId: ID): () => void {
    let refreshPending = false
    return connectWorkspaceEventStream(workspaceId, () => {
      if (refreshPending) return
      refreshPending = true
      void fetchSnapshot(workspaceId, true).finally(() => {
        refreshPending = false
      })
    })
  },

  async provision(bundle: unknown): Promise<ProvisioningResult> {
    const result = await tasklyticApiJson<ProvisioningResult>('/provision', {
      method: 'POST',
      body: JSON.stringify({ bundle }),
    })
    invalidateSnapshots()
    applySnapshot(result.bootstrap, true)
    snapshotRequests.set(
      snapshotKey(result.bootstrap.workspaceId),
      Promise.resolve(result.bootstrap),
    )
    return result
  },
}
