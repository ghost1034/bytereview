/**
 * Running timer state — persisted to localStorage (one timer per user).
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ID } from '../types'

export type RunningTimer = {
  workspaceId: ID
  userId: ID
  taskId?: ID
  projectId?: ID
  matterId?: ID
  clientId?: ID
  startedAt: string
  description: string
  activityCode?: string
  taskCode?: string
  billable: boolean
}

type TimerStore = {
  running: RunningTimer | null
  start: (timer: RunningTimer) => void
  stop: () => RunningTimer | null
  discard: () => void
  updateDescription: (description: string) => void
}

export const useTimerStore = create<TimerStore>()(
  persist(
    (set, get) => ({
      running: null,
      start(timer) {
        set({ running: timer })
      },
      stop() {
        const current = get().running
        set({ running: null })
        return current
      },
      discard() {
        set({ running: null })
      },
      updateDescription(description) {
        const r = get().running
        if (r) set({ running: { ...r, description } })
      },
    }),
    { name: 'tasklytic:timer:v1' }
  )
)
