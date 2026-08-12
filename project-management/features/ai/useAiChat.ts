'use client'

/**
 * Chat hook — sends prompts through getAiAdapter and persists thread messages.
 */
import { useCallback, useState } from 'react'
import { newId } from '../../lib/ids'
import { getAiAdapter, useAiSettingsStore, type AiContextScope } from '../../lib/ai'
import { buildAiContext } from './contextBuilder'

export function useAiChat(workspaceId: string | null, contextScope: AiContextScope | null) {
  const [typing, setTyping] = useState(false)
  const paused = useAiSettingsStore((s) => s.paused)
  const enabled = useAiSettingsStore((s) => s.enabled)
  const activeThreadId = useAiSettingsStore((s) => s.activeThreadId)
  const appendMessage = useAiSettingsStore((s) => s.appendMessage)
  const createThread = useAiSettingsStore((s) => s.createThread)
  const getThread = useAiSettingsStore((s) => s.getThread)

  const ensureThread = useCallback(() => {
    if (!workspaceId) return null
    if (activeThreadId && getThread(activeThreadId)) return activeThreadId
    return createThread(workspaceId, 'New chat', contextScope ?? undefined)
  }, [activeThreadId, contextScope, createThread, getThread, workspaceId])

  const send = useCallback(
    async (prompt: string) => {
      if (!workspaceId || !prompt.trim()) return
      if (paused || !enabled) return

      const threadId = ensureThread()
      if (!threadId) return

      const scope = contextScope ?? { type: 'workspace', workspaceId }
      const context = buildAiContext(scope)
      const thread = getThread(threadId)
      const history = thread?.messages.map((m) => ({ role: m.role, content: m.content }))

      const userMsg = {
        id: newId(),
        role: 'user' as const,
        content: prompt.trim(),
        createdAt: new Date().toISOString(),
      }
      appendMessage(threadId, userMsg)
      setTyping(true)

      try {
        const adapter = getAiAdapter()
        const result = await adapter.generate({ prompt: prompt.trim(), context, history, threadId })
        appendMessage(threadId, {
          id: newId(),
          role: 'assistant',
          content: result.text,
          reasoning: result.reasoning,
          proposals: result.proposals,
          createdAt: new Date().toISOString(),
        })
      } catch (err) {
        appendMessage(threadId, {
          id: newId(),
          role: 'assistant',
          content: `Sorry — ${err instanceof Error ? err.message : 'something went wrong'}.`,
          createdAt: new Date().toISOString(),
        })
      } finally {
        setTyping(false)
      }
    },
    [appendMessage, contextScope, enabled, ensureThread, getThread, paused, workspaceId]
  )

  return { send, typing, disabled: paused || !enabled }
}
