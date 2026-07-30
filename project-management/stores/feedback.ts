import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { newId } from '../lib/ids'
import { now } from '../lib/time'
import type { ID } from '../types'

export type FeedbackEntry = {
  id: ID
  userId: ID
  workspaceId?: ID
  message: string
  createdAt: string
}

type FeedbackState = {
  items: FeedbackEntry[]
  list: () => FeedbackEntry[]
  add: (entry: Omit<FeedbackEntry, 'id' | 'createdAt'>) => void
}

export const useFeedbackStore = create<FeedbackState>()(
  persist(
    (set, get) => ({
      items: [],
      list: () => get().items,
      add: (entry) =>
        set((state) => ({
          items: [
            { ...entry, id: newId(), createdAt: now() },
            ...state.items,
          ],
        })),
    }),
    { name: 'tasklytic:feedback' }
  )
)
