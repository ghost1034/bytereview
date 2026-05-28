'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { apiClient, type AnalyticsStreamUsage, type AnalyticsStreamSession, type AnalyticsUploadedDoc } from '@/lib/api'
import type { AnalyticsChatMessage } from '@/lib/analytics/types'

export type StreamingChatBackend =
  | { kind: 'assistant'; context?: Record<string, unknown> | null; sessionId?: string | null; clientId?: string | null; title?: string | null; uploadedDocs?: AnalyticsUploadedDoc[] | null }
  | { kind: 'research'; bot: 'irs' | 'gaap'; outputStyle?: string; documentContext?: string | null; sessionId?: string | null; clientId?: string | null; title?: string | null; uploadedDocs?: AnalyticsUploadedDoc[] | null }

export interface UseStreamingChatOptions {
  initialMessages?: AnalyticsChatMessage[]
  onUsage?: (usage: AnalyticsStreamUsage) => void
  onSession?: (session: AnalyticsStreamSession) => void
  onError?: (message: string) => void
  /**
   * Fires once the stream finishes successfully, with the raw assistant text
   * including any control tags (e.g. `[ACTION:ADD_RECON_PASS:...]`). Consumers
   * use this to detect frontend-actionable directives without having to
   * re-derive the raw text from `messages` (which has those tags stripped).
   */
  onMessageComplete?: (rawContent: string) => void
}

export interface UseStreamingChatReturn {
  messages: AnalyticsChatMessage[]
  isStreaming: boolean
  error: string | null
  /** Id of the session this conversation is persisted to (set after the first turn). */
  sessionId: string | null
  /** LLM-generated session title (set after the first turn). */
  title: string | null
  sendMessage: (text: string, backend: StreamingChatBackend) => Promise<void>
  stop: () => void
  clear: () => void
  setMessages: (messages: AnalyticsChatMessage[]) => void
  /** Adopt an existing session (e.g. when loading from history) so the next turn appends to it. */
  setSession: (sessionId: string | null, title?: string | null) => void
}

/**
 * React hook wrapping the analytics streaming endpoints.
 *
 * Consumers pass a `backend` descriptor per call so the same hook drives both
 * the floating AI Assistant (`/api/analytics/assistant/stream`) and the IRS /
 * GAAP research bots (`/api/analytics/research/{bot}/stream`).
 */
// Control tags the model embeds to drive frontend actions (e.g. the AI
// Assistant tells the reconciliation module to add a new matching pass).
// Stripped from the visible transcript and re-extracted via `onMessageComplete`.
const ACTION_TAG_REGEX = /\[ACTION:ADD_RECON_PASS:.*?\]/g

export function useStreamingChat(options: UseStreamingChatOptions = {}): UseStreamingChatReturn {
  const { initialMessages = [], onUsage, onSession, onError, onMessageComplete } = options
  const [messages, setMessages] = useState<AnalyticsChatMessage[]>(initialMessages)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [title, setTitle] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const setSession = useCallback((id: string | null, t?: string | null) => {
    setSessionId(id)
    if (t !== undefined) setTitle(t)
  }, [])

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
    setSessionId(null)
    setTitle(null)
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

      // When the caller supplies a `sessionId`, the conversation is already
      // persisted server-side and the stream endpoint *appends* whatever
      // `messages` we send. To avoid duplicating the transcript we therefore
      // send only the new user turn on a continuation; on the first turn (no
      // sessionId) we send the full context so the freshly created session
      // captures the greeting. Document context is always sent separately, so
      // doc-grounded follow-ups still work. The floating AI assistant never
      // passes a sessionId, so its behaviour is unchanged.
      const isContinuation = backend.sessionId != null
      const outboundMessages: AnalyticsChatMessage[] = isContinuation ? [userMsg] : baseMessages
      setIsStreaming(true)
      setError(null)

      const controller = new AbortController()
      abortRef.current = controller

      // Accumulate the raw assistant text (including control tags) so the
      // post-stream callback can scan it; the visible transcript stores the
      // sanitized version. We accumulate locally rather than reading from the
      // message state to avoid races with concurrent setState batches.
      let rawContent = ''

      const appendChunk = (chunk: string) => {
        rawContent += chunk
        const displayContent = rawContent.replace(ACTION_TAG_REGEX, '')
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last && last.role === 'model') {
            next[next.length - 1] = { ...last, content: displayContent }
          }
          return next
        })
      }

      try {
        const handlers = {
          onChunk: appendChunk,
          onUsage: (usage: AnalyticsStreamUsage) => onUsage?.(usage),
          onSession: (session: AnalyticsStreamSession) => {
            setSessionId(session.id)
            setTitle(session.title ?? null)
            onSession?.(session)
          },
          onError: (msg: string) => {
            setError(msg)
            onError?.(msg)
          },
        }

        if (backend.kind === 'assistant') {
          await apiClient.streamAnalyticsAssistant(
            {
              messages: outboundMessages,
              context: backend.context ?? null,
              sessionId: backend.sessionId ?? null,
              clientId: backend.clientId ?? null,
              title: backend.title ?? null,
              uploadedDocs: backend.uploadedDocs ?? undefined,
            },
            handlers,
            { signal: controller.signal },
          )
        } else {
          await apiClient.streamAnalyticsResearch(
            backend.bot,
            {
              messages: outboundMessages,
              outputStyle: backend.outputStyle ?? 'Q&A',
              documentContext: backend.documentContext ?? null,
              sessionId: backend.sessionId ?? null,
              clientId: backend.clientId ?? null,
              title: backend.title ?? null,
              uploadedDocs: backend.uploadedDocs ?? undefined,
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
        if (rawContent) onMessageComplete?.(rawContent)
      }
    },
    [isStreaming, messages, onError, onUsage, onSession, onMessageComplete],
  )

  return { messages, isStreaming, error, sessionId, title, sendMessage, stop, clear, setMessages, setSession }
}
