'use client'

/**
 * Per-(project, viewType) ViewQuery state with workspace search recents.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ProjectView } from '../types'
import { DEFAULT_VIEW_QUERY, type ViewQuery } from '../lib/query/applyQuery'

const RECENT_SEARCH_CAP = 10

function viewKey(projectId: string, viewType: ProjectView = 'list'): string {
  return `${projectId}:${viewType}`
}

type ViewQueryState = {
  byKey: Record<string, ViewQuery>
  defaultSavedViewByKey: Record<string, string>
  recentSearchesByWorkspace: Record<string, string[]>
  getQuery: (projectId: string, viewType?: ProjectView) => ViewQuery
  setQuery: (projectId: string, query: ViewQuery, viewType?: ProjectView) => void
  resetQuery: (projectId: string, viewType?: ProjectView) => void
  patchQuery: (projectId: string, patch: Partial<ViewQuery>, viewType?: ProjectView) => void
  setDefaultSavedView: (projectId: string, viewType: ProjectView, savedViewId: string | null) => void
  getDefaultSavedViewId: (projectId: string, viewType: ProjectView) => string | null
  getRecentSearches: (workspaceId: string) => string[]
  addRecentSearch: (workspaceId: string, query: string) => void
}

export const useViewQueryStore = create<ViewQueryState>()(
  persist(
    (set, get) => ({
      byKey: {},
      defaultSavedViewByKey: {},
      recentSearchesByWorkspace: {},

      getQuery: (projectId, viewType = 'list') => {
        const key = viewKey(projectId, viewType)
        const stored = get().byKey[key] ?? get().byKey[projectId]
        return stored ? { ...DEFAULT_VIEW_QUERY, ...stored } : DEFAULT_VIEW_QUERY
      },

      setQuery: (projectId, query, viewType = 'list') =>
        set((s) => ({
          byKey: { ...s.byKey, [viewKey(projectId, viewType)]: query },
        })),

      resetQuery: (projectId, viewType = 'list') =>
        set((s) => {
          const next = { ...s.byKey }
          delete next[viewKey(projectId, viewType)]
          return { byKey: next }
        }),

      patchQuery: (projectId, patch, viewType = 'list') => {
        const current = get().getQuery(projectId, viewType)
        get().setQuery(projectId, { ...current, ...patch }, viewType)
      },

      setDefaultSavedView: (projectId, viewType, savedViewId) =>
        set((s) => ({
          defaultSavedViewByKey: {
            ...s.defaultSavedViewByKey,
            [viewKey(projectId, viewType)]: savedViewId ?? '',
          },
        })),

      getDefaultSavedViewId: (projectId, viewType) => {
        const id = get().defaultSavedViewByKey[viewKey(projectId, viewType)]
        return id || null
      },

      getRecentSearches: (workspaceId) => get().recentSearchesByWorkspace[workspaceId] ?? [],

      addRecentSearch: (workspaceId, query) => {
        const trimmed = query.trim()
        if (!trimmed) return
        set((s) => {
          const prev = s.recentSearchesByWorkspace[workspaceId] ?? []
          const next = [trimmed, ...prev.filter((q) => q !== trimmed)].slice(0, RECENT_SEARCH_CAP)
          return {
            recentSearchesByWorkspace: { ...s.recentSearchesByWorkspace, [workspaceId]: next },
          }
        })
      },
    }),
    { name: 'tasklytic:viewQuery' }
  )
)

export { viewKey as makeViewQueryKey }
