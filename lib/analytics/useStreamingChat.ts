'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { apiClient, type AnalyticsStreamUsage } from '@/lib/api'
import type { AnalyticsChatMessage } from '@/lib/analytics/types'

export type StreamingChatBackend =
  | { kind: 'assistant'; context?: Record<string, unknown> | null; sessionId?: string | null; clientId?: string | null; title?: string | null }
  | { kind: 'research'; bot: 'irs' | 'gaap'; outputStyle?: string; documentContext?: string | null; sessionId?: string | null; clientId?: string | null; title?: string | null }

export interface UseStreamingChatOptions {
  initialMessages?: AnalyticsChatMessage[]
  onUsage?: (usage: AnalyticsStreamUsage) => void
  onError?: (message: string) => void
}

export interface UseStreamingChatReturn {
  messages: AnalyticsChatMessage[]
  isStreaming: boolean
  error: string | null
  sendMessage: (text: string, backend: StreamingChatBackend) => Promise<void>
  stop: () => void
  clear: () => void
  setMessages: (messages: AnalyticsChatMessage[]) => void
}

/**
 * React hook wrapping the analytics streaming endpoints.
 *
 * Consumers pass a `backend` descriptor per call so the same hook drives both
 * the floating AI Assistant (`/api/analytics/assistant/stream`) and the IRS /
 * GAAP research bots (`/api/analytics/research/{bot}/stream`).
 */
export function useStreamingChat(options: UseStreamingChatOptions = {}): UseStreamingChatReturn {
  const { initialMessages = [], onUsage, onError } = options
  const [messages, setMessages] = useState<AnalyticsChatMessage[]>(initialMessages)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(
    () => () => {
      abortRef.current?.abort()
    },
    [],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsStreaming(false)
  }, [])

  const clear = useCallback(() => {
    stop()
    setMessages([])
    setError(null)
  }, [stop])

  const sendMessage = useCallback(
    async (text: string, backend: StreamingChatBackend) => {
      const trimmed = text.trim()
      if (!trimmed || isStreaming) return

      const userMsg: AnalyticsChatMessage = { role: 'user', content: trimmed }
      const baseMessages: AnalyticsChatMessage[] = [...messages, userMsg]
      // Append both the user message and a blank assistant placeholder that we
      // mutate as chunks arrive.
      setMessages([...baseMessages, { role: 'model', content: '' }])
      setIsStreaming(true)
      setError(null)

      const controller = new AbortController()
      abortRef.current = controller

      const appendChunk = (chunk: string) => {
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last && last.role === 'model') {
            next[next.length - 1] = { ...last, content: last.content + chunk }
          }
          return next
        })
      }

      try {
        const handlers = {
          onChunk: appendChunk,
          onUsage: (usage: AnalyticsStreamUsage) => onUsage?.(usage),
          onError: (msg: string) => {
            setError(msg)
            onError?.(msg)
          },
        }

        if (backend.kind === 'assistant') {
          await apiClient.streamAnalyticsAssistant(
            {
              messages: baseMessages,
              context: backend.context ?? null,
              sessionId: backend.sessionId ?? null,
              clientId: backend.clientId ?? null,
              title: backend.title ?? null,
            },
            handlers,
            { signal: controller.signal },
          )
        } else {
          await apiClient.streamAnalyticsResearch(
            backend.bot,
            {
              messages: baseMessages,
              outputStyle: backend.outputStyle ?? 'Q&A',
              documentContext: backend.documentContext ?? null,
              sessionId: backend.sessionId ?? null,
              clientId: backend.clientId ?? null,
              title: backend.title ?? null,
            },
            handlers,
            { signal: controller.signal },
          )
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          // user-initiated cancellation — nothing to do
        } else {
          const message = err instanceof Error ? err.message : 'Streaming request failed'
          setError(message)
          onError?.(message)
        }
      } finally {
        abortRef.current = null
        setIsStreaming(false)
      }
    },
    [isStreaming, messages, onError, onUsage],
  )

  return { messages, isStreaming, error, sendMessage, stop, clear, setMessages }
}
