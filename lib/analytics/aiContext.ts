'use client'

import { useEffect } from 'react'

/**
 * Module-context publishing for the floating AI Assistant.
 *
 * The assistant widget (`components/analytics/AIAssistant.tsx`) listens for the
 * `analytics-ai-context` window event and forwards the payload to the LLM as
 * the "Current Screen/Project Data Context". Modules publish a compact snapshot
 * of their live state so the assistant can answer data-aware questions ("how
 * many clients do we have?"). This mirrors CPAAnalytics' `update-ai-context`
 * dispatch pattern, the producer side of which had not yet been ported.
 *
 * Modules shipped in later phases (variance, reconciliation, waterfall,
 * amortization) add their own payload shape below and call `useAIContext` from
 * their page, following the same convention.
 */

export const AI_CONTEXT_EVENT = 'analytics-ai-context'

/** Cap published lists so the serialized context stays well under the prompt budget. */
export const AI_CONTEXT_MAX_ITEMS = 100

// --- Per-module payload shapes -------------------------------------------------

export interface ClientsContext {
  clients: {
    count: number
    items: Array<{
      id: string
      name: string
      industry?: string | null
      contactName?: string | null
      contactEmail?: string | null
      fiscalYearEnd?: string | null
    }>
  }
}

export interface ProjectsContext {
  projects: {
    count: number
    items: Array<{
      id: string
      name: string
      status?: string | null
      clientName?: string | null
      module?: string | null
      dueDate?: string | null
      assignee?: string | null
    }>
  }
}

export interface TeamContext {
  team: {
    count: number
    members: Array<{
      name?: string | null
      email?: string | null
      role?: string | null
      persona?: string | null
    }>
  }
}

/**
 * Discriminated by top-level key. The fallback `Record<string, unknown>` keeps
 * the contract open for modules whose payloads are added in Phases 5.4–5.7.
 */
export type AnalyticsAIContext =
  | ClientsContext
  | ProjectsContext
  | TeamContext
  | Record<string, unknown>

// --- Publisher -----------------------------------------------------------------

/** Dispatch a context snapshot (or `null` to clear) to the assistant widget. */
export function publishAIContext(detail: AnalyticsAIContext | null): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(AI_CONTEXT_EVENT, { detail }))
}

/**
 * Publish module context for the lifetime of the calling component.
 *
 * Re-publishes whenever `detail` changes and clears the context (publishes
 * `null`) on unmount, so stale data from a previous screen never leaks into the
 * next module's prompt. Pass a memoized `detail` (e.g. via `useMemo`) to avoid
 * redundant dispatches on every render.
 */
export function useAIContext(detail: AnalyticsAIContext | null): void {
  useEffect(() => {
    publishAIContext(detail)
    return () => publishAIContext(null)
  }, [detail])
}
