/** User-scoped running timers persisted across reloads. */
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type { ID } from '../types'

const serverStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}

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
  runningByUser: Record<ID, RunningTimer>
  start: (timer: RunningTimer) => void
  stop: (userId: ID) => RunningTimer | null
  discard: (userId: ID) => void
  updateDescription: (userId: ID, description: string) => void
}

export const useTimerStore = create<TimerStore>()(
  persist(
    (set, get) => ({
      runningByUser: {},
      start(timer) {
        set((state) => ({ runningByUser: { ...state.runningByUser, [timer.userId]: timer } }))
      },
      stop(userId) {
        const current = get().runningByUser[userId] ?? null
        set((state) => {
          const next = { ...state.runningByUser }
          delete next[userId]
          return { runningByUser: next }
        })
        return current
      },
      discard(userId) {
        get().stop(userId)
      },
      updateDescription(userId, description) {
        set((state) => {
          const current = state.runningByUser[userId]
          return current
            ? { runningByUser: { ...state.runningByUser, [userId]: { ...current, description } } }
            : state
        })
      },
    }),
    {
      name: 'tasklytic:timer:v1',
      version: 2,
      storage: createJSONStorage(() => typeof window === 'undefined' ? serverStorage : window.localStorage),
      migrate: (persisted: unknown) => {
        const state = persisted as { running?: RunningTimer | null; runningByUser?: Record<ID, RunningTimer> }
        if (state.runningByUser) return state
        return {
          ...state,
          runningByUser: state.running ? { [state.running.userId]: state.running } : {},
          running: undefined,
        }
      },
    }
  )
)
