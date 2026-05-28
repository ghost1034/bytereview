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

export interface WaterfallContext {
  waterfall: {
    count: number
    /** "YYYY-MM" the recognized/balance figures are rolled up to. */
    asOf?: string
    items: Array<{
      id: string
      name: string
      /** Subtype, e.g. "Deferred Revenue" | "Prepaid Expenses". */
      subtype: string
      party?: string
      totalAmount: number
      recognizedToDate?: number
      currentBalance?: number
      startDate?: string
      endDate?: string
    }>
  }
}

export interface AmortizationContext {
  amortization: {
    count: number
    /** ISO date the NBV figures are computed as-of (defaults to today). */
    asOf?: string
    totals?: {
      costBasis: number
      nbv: number
      monthlyExpense: number
    }
    items: Array<{
      id: string
      assetName: string
      assetType: string
      costBasis: number
      nbv?: number
      gaapMethod?: string
      taxMethod?: string
      status?: string
      startDate?: string
      client?: string
    }>
  }
}

export interface ReconciliationContext {
  reconciliation: {
    count: number
    items: Array<{
      id: string
      name: string
      status?: string
      client?: string
      sourceACount: number
      sourceBCount: number
      matchGroupCount: number
      unmatchedCount: number
    }>
    /** Populated when an editor is open on a specific reconciliation. */
    active?: {
      id: string
      step: 'upload' | 'rules' | 'results'
      matchedGroups: number
      approvedGroups: number
      rejectedGroups: number
      unmatchedA: number
      unmatchedB: number
    }
  }
}

export interface DashboardContext {
  dashboard: {
    counts: {
      total: number
      pending: number
      inPrep: number
      approved: number
      finalized: number
    }
    items: Array<{
      id: string
      name: string
      module: 'Variance' | 'Reconciliation'
      status: string
      clientName: string
      updatedAt: string
    }>
  }
}

export interface VarianceContext {
  variance: {
    count: number
    items: Array<{
      id: string
      name: string
      status?: string
      client?: string
      /** e.g. "Single Period" | "Base vs Comparison". */
      analysisType?: string
      flaggedCount: number
      reviewedCount: number
    }>
    /** Populated when an editor is open on a specific variance analysis. */
    active?: {
      id: string
      step: 'upload' | 'mapping' | 'config' | 'review' | 'results'
      flaggedCount: number
      totalRows: number
      thresholdDollar?: number
      thresholdPercent?: number
    }
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
  | WaterfallContext
  | AmortizationContext
  | ReconciliationContext
  | VarianceContext
  | DashboardContext
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
