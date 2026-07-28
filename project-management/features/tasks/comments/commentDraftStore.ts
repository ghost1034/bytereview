'use client'

/** Per-user per-task comment draft persistence (zustand + localStorage). */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type DraftState = {
  drafts: Record<string, string>
  getDraft: (userId: string, taskId: string) => string
  setDraft: (userId: string, taskId: string, html: string) => void
  clearDraft: (userId: string, taskId: string) => void
}

function draftKey(userId: string, taskId: string): string {
  return `${userId}:${taskId}`
}

export const useCommentDraftStore = create<DraftState>()(
  persist(
    (set, get) => ({
      drafts: {},

      getDraft(userId, taskId) {
        return get().drafts[draftKey(userId, taskId)] ?? ''
      },

      setDraft(userId, taskId, html) {
        const key = draftKey(userId, taskId)
        set((s) => ({ drafts: { ...s.drafts, [key]: html } }))
      },

      clearDraft(userId, taskId) {
        const key = draftKey(userId, taskId)
        set((s) => {
          const drafts = { ...s.drafts }
          delete drafts[key]
          return { drafts }
        })
      },
    }),
    { name: 'tasklytic:comment-drafts' }
  )
)
