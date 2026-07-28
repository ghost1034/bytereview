'use client'

/**
 * useMyTasksLayout — read/write personal section layout for the current user.
 */
import { useCallback, useMemo } from 'react'
import { useUsersStore } from '../../stores/entities'
import { getMyTasksLayout, saveMyTasksLayout } from './myTasksActions'
import type { MyTasksLayout, UserWithMyTasks } from './types'
import { normalizeLayout } from './myTasksUtils'

/** Layout state for My Tasks sections in a workspace. */
export function useMyTasksLayout(workspaceId: string, userId: string | null) {
  const user = useUsersStore((s) => (userId ? (s.getById(userId) as UserWithMyTasks | undefined) : undefined))

  const layout = useMemo(
    () => (userId ? getMyTasksLayout(userId, workspaceId) : normalizeLayout(undefined)),
    [user, userId, workspaceId]
  )

  const updateLayout = useCallback(
    async (next: MyTasksLayout) => {
      if (!userId) return
      await saveMyTasksLayout(userId, workspaceId, next)
    },
    [userId, workspaceId]
  )

  return { layout, updateLayout }
}
