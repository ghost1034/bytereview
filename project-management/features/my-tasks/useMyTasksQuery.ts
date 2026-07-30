'use client'

/**
 * useMyTasksQuery — ViewQuery state keyed per workspace for My Tasks views.
 */
import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { DEFAULT_VIEW_QUERY, patchViewQuery, type ViewQuery } from '../../lib/query/applyQuery'
import { useViewQueryStore } from '../../stores/viewQuery'
import type { MyTasksViewMode } from './types'

const MY_TASKS_DEFAULT: ViewQuery = {
  ...DEFAULT_VIEW_QUERY,
  hiddenCompleted: true,
  showCompleted: false,
}

function queryKey(workspaceId: string, view: MyTasksViewMode): string {
  return `my-tasks:${workspaceId}:${view}`
}

/** Subscribe to filter/sort state for a My Tasks view mode. */
export function useMyTasksQuery(workspaceId: string, viewMode: MyTasksViewMode) {
  const key = queryKey(workspaceId, viewMode)
  const query = useViewQueryStore(
    useShallow((s) => {
      const stored = s.byKey[key]
      return stored ? { ...MY_TASKS_DEFAULT, ...stored } : MY_TASKS_DEFAULT
    })
  )
  const setQueryRaw = useViewQueryStore((s) => s.setQuery)

  const setQuery = useCallback(
    (next: ViewQuery) => setQueryRaw(key, next, 'list'),
    [key, setQueryRaw]
  )

  const patchQuery = useCallback(
    (patch: Partial<ViewQuery>) => {
      const current = useViewQueryStore.getState().byKey[key] ?? MY_TASKS_DEFAULT
      setQueryRaw(key, patchViewQuery({ ...MY_TASKS_DEFAULT, ...current }, patch), 'list')
    },
    [key, setQueryRaw]
  )

  return { query, setQuery, patchQuery }
}

export { MY_TASKS_DEFAULT }
