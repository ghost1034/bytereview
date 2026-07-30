import { create } from 'zustand'

import { persist } from 'zustand/middleware'

import { getRepository } from '../lib/repository'

import { setRepositoryPartition, type RepositoryPartition } from '../lib/repository/partition'

import type { Session } from '../types'



type AuthState = {

  currentUserId: string | null

  partition: RepositoryPartition

  hydrated: boolean

  hydrate: () => Promise<void>

  setCurrentUser: (id: string | null, options?: { partition?: RepositoryPartition }) => Promise<void>

}



export const useAuthStore = create<AuthState>((set) => ({

  currentUserId: null,

  partition: 'default',

  hydrated: false,



  async hydrate() {

    const repo = getRepository()

    const sessions = await repo.loadAll<Session>('session')

    const session = sessions[0]

    const partition = session?.partition ?? 'default'

    setRepositoryPartition(partition)

    set({

      currentUserId: session?.currentUserId ?? null,

      partition,

      hydrated: true,

    })

  },



  async setCurrentUser(id, options) {
    const partition = id === null ? 'default' : (options?.partition ?? 'default')
    setRepositoryPartition(partition)

    const repo = getRepository()

    await repo.saveAll<Session>('session', [{ currentUserId: id, partition }])

    set({ currentUserId: id, partition })

  },

}))



export type Crumb = { label: string; href?: string }



const SIDEBAR_WIDTH_MIN = 200
const SIDEBAR_WIDTH_MAX = 320
const SIDEBAR_WIDTH_DEFAULT = 240

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, width))
}

export { SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_DEFAULT }

type ShellAction =
  | 'quickAdd'
  | 'createProject'
  | 'createGoal'
  | 'createPortfolio'
  | 'toggleTheme'
  | 'showShortcuts'
  | 'restartTour'
  | null

type UiState = {

  sidebarCollapsed: boolean

  setSidebarCollapsed: (v: boolean) => void

  sidebarWidth: number

  setSidebarWidth: (v: number) => void

  shellAction: ShellAction

  dispatchShellAction: (action: Exclude<ShellAction, null>) => void

  clearShellAction: () => void

  breadcrumbs: Crumb[]

  setBreadcrumbs: (crumbs: Crumb[]) => void

  activeWorkspaceId: string | null

  setActiveWorkspaceId: (id: string | null) => void

  commandPaletteOpen: boolean

  setCommandPaletteOpen: (v: boolean) => void

  taskDetailId: string | null

  setTaskDetailId: (id: string | null) => void

  projectViewMode: 'grid' | 'list'

  setProjectViewMode: (mode: 'grid' | 'list') => void

}



export const useUiStore = create<UiState>()(

  persist(

    (set) => ({

      sidebarCollapsed: false,

      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),

      sidebarWidth: SIDEBAR_WIDTH_DEFAULT,

      setSidebarWidth: (v) => set({ sidebarWidth: clampSidebarWidth(v) }),

      shellAction: null,

      dispatchShellAction: (action) => set({ shellAction: action }),

      clearShellAction: () => set({ shellAction: null }),

      breadcrumbs: [],

      setBreadcrumbs: (crumbs) => set({ breadcrumbs: crumbs }),

      activeWorkspaceId: null,

      setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),

      commandPaletteOpen: false,

      setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),

      taskDetailId: null,

      setTaskDetailId: (id) => set({ taskDetailId: id }),

      projectViewMode: 'grid',

      setProjectViewMode: (mode) => set({ projectViewMode: mode }),

    }),

    { name: 'tasklytic:ui' }

  )

)

