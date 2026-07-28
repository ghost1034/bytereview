'use client'

/**
 * AiAssistantPanel — Tasklytic AI right sidebar (Vertex server / Gemini / local fallback).
 * Export kept compatible with TasklyticChrome: `{ open, onOpenChange }`.
 */
import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuthStore } from '../../stores/auth'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useAiSettingsStore } from '../../lib/ai'
import { AiPanelHeader } from './AiPanelHeader'
import { AiMessageList } from './AiMessageList'
import { AiInputArea } from './AiInputArea'
import { AiThreadList } from './AiThreadList'
import { AiSettingsSection } from './AiSettingsSection'
import { useAiContextScope } from './useAiContext'
import { useAiChat } from './useAiChat'

type Props = { open: boolean; onOpenChange: (v: boolean) => void }

export function AiAssistantPanel({ open, onOpenChange }: Props) {
  const { workspaceId } = useWorkspaceContext()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const contextScope = useAiContextScope()
  const activeThreadId = useAiSettingsStore((s) => s.activeThreadId)
  const getThread = useAiSettingsStore((s) => s.getThread)
  const createThread = useAiSettingsStore((s) => s.createThread)
  const [tab, setTab] = useState<'chat' | 'settings'>('chat')

  const { send, typing, disabled } = useAiChat(workspaceId, contextScope)
  const thread = activeThreadId ? getThread(activeThreadId) : undefined

  useEffect(() => {
    if (open && workspaceId && !activeThreadId) {
      createThread(workspaceId, 'New chat', contextScope ?? undefined)
    }
  }, [open, workspaceId, activeThreadId, createThread, contextScope])

  if (!open) {
    return (
      <button
        type="button"
        className="fixed bottom-6 right-6 z-30 flex h-12 w-12 items-center justify-center rounded-full shadow-glow-sm tl-btn-primary"
        aria-label="Open Project Management AI"
        data-tour="ai-sparkles"
        onClick={() => onOpenChange(true)}
      >
        <Sparkles className="h-5 w-5 text-white" />
      </button>
    )
  }

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/20 lg:bg-transparent"
        aria-label="Close AI panel backdrop"
        onClick={() => onOpenChange(false)}
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-[380px] max-w-[100vw] flex-col border-l shadow-paper-lg"
        style={{ borderColor: 'var(--border-subtle)' }}
        aria-label="Project Management AI panel"
      >
        <AiPanelHeader onClose={() => onOpenChange(false)} onOpenSettings={() => setTab('settings')} />

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'chat' | 'settings')} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-3 mt-2 grid w-auto grid-cols-2">
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
            {workspaceId ? <AiThreadList workspaceId={workspaceId} /> : null}
            <AiMessageList thread={thread} actorId={currentUserId} typing={typing} />
            <AiInputArea scope={contextScope} disabled={disabled} onSend={(p) => void send(p)} />
          </TabsContent>

          <TabsContent value="settings" className="mt-0 flex-1 overflow-y-auto data-[state=inactive]:hidden">
            <AiSettingsSection />
          </TabsContent>
        </Tabs>
      </aside>
    </>
  )
}
