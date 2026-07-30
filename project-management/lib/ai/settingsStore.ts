'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AiChatRole, AiContextScope, AiProposal, GeminiModelId } from './types'

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
  apiKey: string
  model: GeminiModelId
  activeThreadId: string | null
  threads: AiThread[]
  setEnabled: (v: boolean) => void
  setPaused: (v: boolean) => void
  setApiKey: (key: string) => void
  setModel: (model: GeminiModelId) => void
  setActiveThread: (id: string | null) => void
  upsertThread: (thread: AiThread) => void
  appendMessage: (threadId: string, message: AiChatMessage) => void
  createThread: (workspaceId: string, title?: string, contextScope?: AiContextScope) => string
  getThread: (id: string) => AiThread | undefined
  listThreads: (workspaceId: string) => AiThread[]
}

/** Resolved API key: local settings first, then NEXT_PUBLIC_GEMINI_API_KEY. */
export function resolveGeminiApiKey(settingsKey: string): string {
  const trimmed = settingsKey.trim()
  if (trimmed) return trimmed
  return (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_GEMINI_API_KEY : '') ?? ''
}

export const useAiSettingsStore = create<AiSettingsState>()(
  persist(
    (set, get) => ({
      enabled: true,
      paused: false,
      apiKey: '',
      model: 'gemini-2.5-flash',
      activeThreadId: null,
      threads: [],
      setEnabled: (v) => set({ enabled: v }),
      setPaused: (v) => set({ paused: v }),
      setApiKey: (key) => set({ apiKey: key }),
      setModel: (model) => set({ model }),
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
    }),
    { name: 'tasklytic:ai:v1' }
  )
)
