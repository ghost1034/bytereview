'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AiChatRole, AiContextScope, AiProposal, GeminiModelId, VertexModelOption } from './types'

export type AiChatMessage = {
  id: string
  role: AiChatRole
  content: string
  reasoning?: string
  proposals?: AiProposal[]
  createdAt: string
}

export type AiThread = {
  id: string
  workspaceId: string
  title: string
  messages: AiChatMessage[]
  contextScope?: AiContextScope
  updatedAt: string
}

type AiSettingsState = {
  enabled: boolean
  paused: boolean
  model: GeminiModelId
  modelOptions: VertexModelOption[]
  activeThreadId: string | null
  threads: AiThread[]
  setEnabled: (v: boolean) => void
  setPaused: (v: boolean) => void
  setModel: (model: GeminiModelId) => void
  setModelOptions: (models: VertexModelOption[]) => void
  setActiveThread: (id: string | null) => void
  upsertThread: (thread: AiThread) => void
  appendMessage: (threadId: string, message: AiChatMessage) => void
  createThread: (workspaceId: string, title?: string, contextScope?: AiContextScope) => string
  getThread: (id: string) => AiThread | undefined
  listThreads: (workspaceId: string) => AiThread[]
  replaceWorkspaceThreads: (workspaceId: string, threads: AiThread[]) => void
}

export const useAiSettingsStore = create<AiSettingsState>()(
  persist(
    (set, get) => ({
      enabled: true,
      paused: false,
      model: 'gemini-2.5-flash',
      modelOptions: [],
      activeThreadId: null,
      threads: [],
      setEnabled: (v) => set({ enabled: v }),
      setPaused: (v) => set({ paused: v }),
      setModel: (model) => set({ model }),
      setModelOptions: (modelOptions) => set({ modelOptions }),
      setActiveThread: (id) => set({ activeThreadId: id }),
      upsertThread: (thread) =>
        set((s) => ({
          threads: [...s.threads.filter((t) => t.id !== thread.id), thread].sort((a, b) =>
            b.updatedAt.localeCompare(a.updatedAt)
          ),
        })),
      appendMessage: (threadId, message) => {
        const thread = get().threads.find((t) => t.id === threadId)
        if (!thread) return
        const updated: AiThread = {
          ...thread,
          messages: [...thread.messages, message],
          updatedAt: message.createdAt,
          title: thread.title === 'New chat' && message.role === 'user' ? message.content.slice(0, 48) : thread.title,
        }
        get().upsertThread(updated)
      },
      createThread: (workspaceId, title = 'New chat', contextScope) => {
        const id = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const now = new Date().toISOString()
        const thread: AiThread = { id, workspaceId, title, messages: [], contextScope, updatedAt: now }
        get().upsertThread(thread)
        set({ activeThreadId: id })
        return id
      },
      getThread: (id) => get().threads.find((t) => t.id === id),
      listThreads: (workspaceId) =>
        get()
          .threads.filter((t) => t.workspaceId === workspaceId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      replaceWorkspaceThreads: (workspaceId, threads) => set((state) => ({
        threads: [...state.threads.filter((thread) => thread.workspaceId !== workspaceId), ...threads],
        activeThreadId: threads.some((thread) => thread.id === state.activeThreadId)
          ? state.activeThreadId
          : threads[0]?.id ?? null,
      })),
    }),
    {
      name: 'tasklytic:ai:v1',
      version: 2,
      migrate: (persisted) => {
        const state = { ...(persisted as Record<string, unknown>) }
        delete state.apiKey
        return state as unknown as AiSettingsState
      },
    }
  )
)
