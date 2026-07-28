/**
 * Production repository adapter — REST fetch to /api/tasklytic/* with Firebase auth.
 * Workspace-scoped entities include ?workspace_id= on each request.
 */
import { tasklyticApiFetch, tasklyticApiJson } from '../tasklyticApi'
import type { ID } from '../../types'
import type { EntityKind, RepositoryAdapter } from './types'
import {
  getActiveRepositoryWorkspaceId,
  isWorkspaceScopedEntity,
} from './workspaceScope'

const SCHEMA_VERSION = 1

type Listener = (items: unknown[]) => void

const listeners = new Map<EntityKind, Set<Listener>>()
const cache = new Map<EntityKind, unknown[]>()

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
    try {
      const items = await tasklyticApiJson<T[]>(entityPath(entity))
      const rows = Array.isArray(items) ? items : []
      cache.set(entity, rows)
      return rows
    } catch (err) {
      if (err instanceof Error && (err.message.includes('404') || err.message.includes('403'))) {
        cache.set(entity, [])
        return []
      }
      throw err
    }
  },

  async saveAll<T>(entity: EntityKind, items: T[]): Promise<void> {
    await tasklyticApiJson(entityPath(entity), { method: 'PUT', body: JSON.stringify(items) })
    cache.set(entity, items)
    emit(entity, items)
  },

  async upsertOne<T extends { id: ID }>(entity: EntityKind, item: T): Promise<void> {
    await tasklyticApiJson(entityPath(entity, `/${item.id}`), {
      method: 'PUT',
      body: JSON.stringify(item),
    })
    const items = (cache.get(entity) ?? []) as T[]
    const idx = items.findIndex((i) => i.id === item.id)
    if (idx >= 0) items[idx] = item
    else items.push(item)
    cache.set(entity, items)
    emit(entity, items)
  },

  async removeOne(entity: EntityKind, id: ID): Promise<void> {
    await tasklyticApiFetch(entityPath(entity, `/${id}`), { method: 'DELETE' })
    const items = (cache.get(entity) ?? []).filter((i) => (i as { id: ID }).id !== id)
    cache.set(entity, items)
    emit(entity, items)
  },

  async clearAll(): Promise<void> {
    await tasklyticApiJson('/clear', { method: 'POST' })
    cache.clear()
    listeners.forEach((_, entity) => emit(entity, []))
  },

  subscribe(entity: EntityKind, cb: (items: unknown[]) => void): () => void {
    if (!listeners.has(entity)) listeners.set(entity, new Set())
    listeners.get(entity)!.add(cb)
    return () => listeners.get(entity)?.delete(cb)
  },

  async provision(): Promise<void> {
    await tasklyticApiJson('/provision', { method: 'POST' })
  },
}
