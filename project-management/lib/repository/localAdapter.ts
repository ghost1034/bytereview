/**
 * V1 localStorage-backed repository adapter.
 * Production swap-out: bind the same interface to REST/GraphQL backend.
 */
import type { ID } from '../../types'
import { getStoragePrefix } from './partition'
import type { EntityKind, RepositoryAdapter } from './types'

const SCHEMA_VERSION = 1

type Listener = (items: unknown[]) => void

const listeners = new Map<EntityKind, Set<Listener>>()

function storageKey(entity: EntityKind): string {
  return `${getStoragePrefix()}:${entity}`
}

function emit(entity: EntityKind, items: unknown[]): void {
  listeners.get(entity)?.forEach((cb) => cb(items))
}

function readRaw(entity: EntityKind): unknown[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(storageKey(entity))
  if (!raw) return []
  try {
    return JSON.parse(raw) as unknown[]
  } catch {
    return []
  }
}

function writeRaw(entity: EntityKind, items: unknown[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(storageKey(entity), JSON.stringify(items))
  emit(entity, items)
}

export const localRepositoryAdapter: RepositoryAdapter = {
  schemaVersion: SCHEMA_VERSION,

  async migrateIfNeeded(): Promise<void> {
    if (typeof window === 'undefined') return
    const prefix = getStoragePrefix()
    const versionKey = `${prefix}:schemaVersion`
    const stored = window.localStorage.getItem(versionKey)
    if (stored && Number(stored) !== SCHEMA_VERSION) {
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith(prefix))
        .forEach((k) => window.localStorage.removeItem(k))
    }
    window.localStorage.setItem(versionKey, String(SCHEMA_VERSION))
  },

  async loadAll<T>(entity: EntityKind): Promise<T[]> {
    return readRaw(entity) as T[]
  },

  async saveAll<T>(entity: EntityKind, items: T[]): Promise<void> {
    writeRaw(entity, items)
  },

  async upsertOne<T extends { id: ID }>(entity: EntityKind, item: T): Promise<void> {
    const items = readRaw(entity) as T[]
    const idx = items.findIndex((i) => i.id === item.id)
    if (idx >= 0) items[idx] = item
    else items.push(item)
    writeRaw(entity, items)
  },

  async removeOne(entity: EntityKind, id: ID): Promise<void> {
    const items = readRaw(entity).filter((i) => (i as { id: ID }).id !== id)
    writeRaw(entity, items)
  },

  async clearAll(): Promise<void> {
    if (typeof window === 'undefined') return
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith(getStoragePrefix()))
      .forEach((k) => window.localStorage.removeItem(k))
  },

  subscribe(entity: EntityKind, cb: (items: unknown[]) => void): () => void {
    if (!listeners.has(entity)) listeners.set(entity, new Set())
    listeners.get(entity)!.add(cb)
    return () => listeners.get(entity)?.delete(cb)
  },

  async provision(): Promise<void> {
    /* onboarding pipeline calls this in step 30 */
  },
}
