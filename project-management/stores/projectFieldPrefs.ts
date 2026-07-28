'use client'

/** Per-project custom field display prefs (e.g. show on board card). */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Prefs = Record<string, { showOnCard?: boolean }>

type State = {
  byProject: Record<string, Prefs>
  getShowOnCard: (projectId: string, fieldId: string) => boolean
  setShowOnCard: (projectId: string, fieldId: string, show: boolean) => void
}

export const useProjectFieldPrefsStore = create<State>()(
  persist(
    (set, get) => ({
      byProject: {},

      getShowOnCard(projectId, fieldId) {
        return get().byProject[projectId]?.[fieldId]?.showOnCard ?? false
      },

      setShowOnCard(projectId, fieldId, show) {
        set((s) => ({
          byProject: {
            ...s.byProject,
            [projectId]: {
              ...s.byProject[projectId],
              [fieldId]: { ...s.byProject[projectId]?.[fieldId], showOnCard: show },
            },
          },
        }))
      },
    }),
    { name: 'tasklytic:project-field-prefs' }
  )
)
