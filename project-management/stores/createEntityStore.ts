/**
 * Generic Zustand entity store factory — one store per domain collection.
 */
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { logMutation } from '../lib/mutationLog'
import { getRepository, type EntityKind } from '../lib/repository'
import type { ID } from '../types'

export type EntityStore<T extends { id: ID }> = {
  items: Record<ID, T>
  hydrated: boolean
  hydrate: () => Promise<void>
  add: (item: T) => Promise<void>
  update: (id: ID, patch: Partial<T>) => Promise<void>
  remove: (id: ID) => Promise<void>
  bulkSet: (items: T[]) => Promise<void>
  getById: (id: ID) => T | undefined
  list: () => T[]
}

/** Create a persisted entity store backed by the repository adapter. */
export function createEntityStore<T extends { id: ID }>(entity: EntityKind) {
  let unsubscribeRepository: (() => void) | null = null
  const useBase = create<EntityStore<T>>()((set, get) => ({
    items: {},
    hydrated: false,

    async hydrate() {
      const repo = getRepository()
      try {
        const rows = await repo.loadAll<T>(entity)
        const items: Record<ID, T> = {}
        rows.forEach((row) => {
          items[row.id] = row
        })
        set({ items, hydrated: true })
        unsubscribeRepository?.()
        unsubscribeRepository = repo.subscribe(entity, (next) => {
          const mapped: Record<ID, T> = {}
          ;(next as T[]).forEach((row) => {
            mapped[row.id] = row
          })
          set({ items: mapped })
        })
      } catch (err) {
        console.warn(`Tasklytic store hydrate failed (${entity}):`, err)
        set({ hydrated: true })
      }
    },

    async add(item) {
      const repo = getRepository()
      const saved = await repo.upsertOne(entity, item)
      logMutation({ entity, action: 'add', id: item.id })
      set((s) => ({ items: { ...s.items, [item.id]: saved as T } }))
    },

    async update(id, patch) {
      const current = get().items[id]
      if (!current) return
      const next = { ...current, ...patch } as T
      const repo = getRepository()
      const saved = await repo.upsertOne(entity, next)
      logMutation({ entity, action: 'update', id })
      set((s) => ({ items: { ...s.items, [id]: saved as T } }))
    },

    async remove(id) {
      const repo = getRepository()
      await repo.removeOne(entity, id)
      logMutation({ entity, action: 'remove', id })
      set((s) => {
        const items = { ...s.items }
        delete items[id]
        return { items }
      })
    },

    async bulkSet(rows) {
      const repo = getRepository()
      const saved = await repo.saveAll(entity, rows)
      logMutation({ entity, action: 'bulkSet' })
      const items: Record<ID, T> = {}
      saved.forEach((row) => {
        items[row.id] = row
      })
      set({ items })
    },

    getById(id) {
      return get().items[id]
    },

    list() {
      return Object.values(get().items)
    },
  }))

  // zustand v5 compares snapshots with Object.is. Selectors that derive arrays
  // (e.g. `s.list().filter(...)`) return a fresh reference every call, which
  // would force infinite re-renders via useSyncExternalStore. Wrapping every
  // selector with useShallow keeps snapshots referentially stable when their
  // shallow contents are unchanged.
  const identity = (s: EntityStore<T>) => s
  function useStore(): EntityStore<T>
  function useStore<U>(selector: (s: EntityStore<T>) => U): U
  function useStore<U>(selector?: (s: EntityStore<T>) => U) {
    return useBase(useShallow((selector ?? identity) as (s: EntityStore<T>) => U))
  }

  return Object.assign(useStore, {
    getState: useBase.getState,
    getInitialState: useBase.getInitialState,
    setState: useBase.setState,
    subscribe: useBase.subscribe,
  }) as typeof useBase
}
