'use client'

/**
 * Hook binding a project view to persisted ViewQuery state.
 */
import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { ProjectView } from '../../types'
import { DEFAULT_VIEW_QUERY, patchViewQuery, type ViewQuery } from '../../lib/query/applyQuery'
import { makeViewQueryKey, useViewQueryStore } from '../../stores/viewQuery'

/** Subscribe to and mutate ViewQuery for a project + view type. */
export function useViewQuery(projectId: string, viewType: ProjectView = 'list') {
  const query = useViewQueryStore(
    useShallow((s) => {
      const key = makeViewQueryKey(projectId, viewType)
      const stored = s.byKey[key] ?? s.byKey[projectId]
      return stored ? { ...DEFAULT_VIEW_QUERY, ...stored } : DEFAULT_VIEW_QUERY
    })
  )
  const setQueryRaw = useViewQueryStore((s) => s.setQuery)
  const resetQueryRaw = useViewQueryStore((s) => s.resetQuery)
  const patchQueryRaw = useViewQueryStore((s) => s.patchQuery)

  const setQuery = useCallback(
    (next: ViewQuery) => setQueryRaw(projectId, next, viewType),
    [projectId, setQueryRaw, viewType]
  )

  const patchQuery = useCallback(
    (patch: Partial<ViewQuery>) => {
      const current = useViewQueryStore.getState().getQuery(projectId, viewType)
      setQueryRaw(projectId, patchViewQuery(current, patch), viewType)
    },
    [projectId, setQueryRaw, viewType]
  )

  const resetQuery = useCallback(
    () => resetQueryRaw(projectId, viewType),
    [projectId, resetQueryRaw, viewType]
  )

  return { query, setQuery, patchQuery, resetQuery }
}
