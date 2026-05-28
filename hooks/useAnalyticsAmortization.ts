'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import type {
  AnalyticsAmortizationComplianceRequest,
  AnalyticsAmortizationCreateRequest,
  AnalyticsAmortizationExtractRequest,
  AnalyticsAmortizationScheduleRequest,
  AnalyticsAmortizationUpdateRequest,
  AnalyticsJournalEntryCreateRequest,
} from '@/lib/analytics/types'

const amortizationKey = (uid?: string) => ['analytics', 'amortization', uid] as const
const amortizationItemKey = (uid: string | undefined, id: string) =>
  ['analytics', 'amortization', uid, id] as const
const journalEntriesKey = (uid: string | undefined, amortizationId?: string) =>
  ['analytics', 'amortization', 'journal-entries', uid, amortizationId ?? 'all'] as const

export function useAnalyticsAmortizations() {
  const { user } = useAuth()

  return useQuery({
    queryKey: amortizationKey(user?.uid),
    queryFn: () => apiClient.listAnalyticsAmortizations(),
    enabled: !!user,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useAnalyticsAmortization(amortizationId: string | null | undefined) {
  const { user } = useAuth()

  return useQuery({
    queryKey: amortizationItemKey(user?.uid, amortizationId ?? ''),
    queryFn: () => apiClient.getAnalyticsAmortization(amortizationId as string),
    enabled: !!user && !!amortizationId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useCreateAnalyticsAmortization() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (data: AnalyticsAmortizationCreateRequest) =>
      apiClient.createAnalyticsAmortization(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: amortizationKey(user?.uid) }),
  })
}

export function useUpdateAnalyticsAmortization() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: ({
      amortizationId,
      data,
    }: {
      amortizationId: string
      data: AnalyticsAmortizationUpdateRequest
    }) => apiClient.updateAnalyticsAmortization(amortizationId, data),
    onSuccess: (_res, { amortizationId }) => {
      queryClient.invalidateQueries({ queryKey: amortizationKey(user?.uid) })
      queryClient.invalidateQueries({ queryKey: amortizationItemKey(user?.uid, amortizationId) })
    },
  })
}

export function useDeleteAnalyticsAmortization() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (amortizationId: string) => apiClient.deleteAnalyticsAmortization(amortizationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: amortizationKey(user?.uid) }),
  })
}

/** LLM extract — one-shot before the user edits the form; not cached. */
export function useExtractAnalyticsAmortization() {
  return useMutation({
    mutationFn: (data: AnalyticsAmortizationExtractRequest) =>
      apiClient.extractAnalyticsAmortization(data),
  })
}

/** LLM compliance check on the current form — one-shot, not cached. */
export function useComplianceCheckAnalyticsAmortization() {
  return useMutation({
    mutationFn: (data: AnalyticsAmortizationComplianceRequest) =>
      apiClient.complianceCheckAnalyticsAmortization(data),
  })
}

/** Deterministic schedule generation — cheap server-side dispatch; not cached. */
export function useGenerateAnalyticsAmortizationSchedule() {
  return useMutation({
    mutationFn: (data: AnalyticsAmortizationScheduleRequest) =>
      apiClient.generateAnalyticsAmortizationSchedule(data),
  })
}

export function useAnalyticsJournalEntries(amortizationId?: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: journalEntriesKey(user?.uid, amortizationId),
    queryFn: () => apiClient.listAnalyticsJournalEntries(amortizationId),
    enabled: !!user,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useCreateAnalyticsJournalEntry() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (data: AnalyticsJournalEntryCreateRequest) =>
      apiClient.createAnalyticsJournalEntry(data),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: journalEntriesKey(user?.uid, vars.amortization_id ?? undefined) })
      queryClient.invalidateQueries({ queryKey: journalEntriesKey(user?.uid, undefined) })
    },
  })
}
