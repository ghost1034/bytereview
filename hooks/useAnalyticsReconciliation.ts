'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import type {
  AnalyticsReconciliation,
  AnalyticsReconciliationAdditionalPassRequest,
  AnalyticsReconciliationBasicRequest,
  AnalyticsReconciliationCreateRequest,
  AnalyticsReconciliationManualMatchRequest,
  AnalyticsReconciliationMatchRequest,
  AnalyticsReconciliationRulesGenerateRequest,
  AnalyticsReconciliationUpdateRequest,
} from '@/lib/analytics/types'

const reconciliationKey = (uid?: string) => ['analytics', 'reconciliation', uid] as const
const reconciliationItemKey = (uid: string | undefined, id: string) =>
  ['analytics', 'reconciliation', uid, id] as const

export function useAnalyticsReconciliations() {
  const { user } = useAuth()

  return useQuery({
    queryKey: reconciliationKey(user?.uid),
    queryFn: () => apiClient.listAnalyticsReconciliations(),
    enabled: !!user,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useAnalyticsReconciliation(reconciliationId: string | null | undefined) {
  const { user } = useAuth()

  return useQuery({
    queryKey: reconciliationItemKey(user?.uid, reconciliationId ?? ''),
    queryFn: () => apiClient.getAnalyticsReconciliation(reconciliationId as string),
    enabled: !!user && !!reconciliationId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useCreateAnalyticsReconciliation() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (data: AnalyticsReconciliationCreateRequest) =>
      apiClient.createAnalyticsReconciliation(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reconciliationKey(user?.uid) }),
  })
}

export function useUpdateAnalyticsReconciliation() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: ({
      reconciliationId,
      data,
    }: {
      reconciliationId: string
      data: AnalyticsReconciliationUpdateRequest
    }) => apiClient.updateAnalyticsReconciliation(reconciliationId, data),
    onSuccess: (response, { reconciliationId }) => {
      queryClient.setQueryData<AnalyticsReconciliation>(
        reconciliationItemKey(user?.uid, reconciliationId),
        response,
      )
      queryClient.invalidateQueries({ queryKey: reconciliationKey(user?.uid) })
    },
  })
}

export function useDeleteAnalyticsReconciliation() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (reconciliationId: string) =>
      apiClient.deleteAnalyticsReconciliation(reconciliationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reconciliationKey(user?.uid) }),
  })
}

/** LLM: generate initial matching rule passes from column headers. */
export function useGenerateReconciliationRules() {
  return useMutation({
    mutationFn: (data: AnalyticsReconciliationRulesGenerateRequest) =>
      apiClient.generateReconciliationRules(data),
  })
}

/** LLM: refine rules with natural-language instructions; returns one new pass. */
export function useGenerateAdditionalReconciliationPass() {
  return useMutation({
    mutationFn: (data: AnalyticsReconciliationAdditionalPassRequest) =>
      apiClient.generateAdditionalReconciliationPass(data),
  })
}

/** LLM: execute the rule passes against both sources. */
export function usePerformReconciliationMatch() {
  return useMutation({
    mutationFn: (data: AnalyticsReconciliationMatchRequest) =>
      apiClient.performReconciliationMatch(data),
  })
}

/** LLM: basic reconciliation (no explicit rule definitions). */
export function useReconcileBasic() {
  return useMutation({
    mutationFn: (data: AnalyticsReconciliationBasicRequest) => apiClient.reconcileBasic(data),
  })
}

export function useManualMatchReconciliation() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: ({
      reconciliationId,
      data,
    }: {
      reconciliationId: string
      data: AnalyticsReconciliationManualMatchRequest
    }) => apiClient.manualMatchReconciliation(reconciliationId, data),
    onSuccess: (response, { reconciliationId }) => {
      queryClient.setQueryData<AnalyticsReconciliation>(
        reconciliationItemKey(user?.uid, reconciliationId),
        response,
      )
      queryClient.invalidateQueries({ queryKey: reconciliationKey(user?.uid) })
    },
  })
}

export function useApproveReconciliationGroup() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: ({
      reconciliationId,
      groupId,
    }: {
      reconciliationId: string
      groupId: string
    }) => apiClient.approveReconciliationGroup(reconciliationId, groupId),
    onSuccess: (response, { reconciliationId }) => {
      queryClient.setQueryData<AnalyticsReconciliation>(
        reconciliationItemKey(user?.uid, reconciliationId),
        response,
      )
      queryClient.invalidateQueries({ queryKey: reconciliationKey(user?.uid) })
    },
  })
}

export function useRejectReconciliationGroup() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: ({
      reconciliationId,
      groupId,
    }: {
      reconciliationId: string
      groupId: string
    }) => apiClient.rejectReconciliationGroup(reconciliationId, groupId),
    onSuccess: (response, { reconciliationId }) => {
      queryClient.setQueryData<AnalyticsReconciliation>(
        reconciliationItemKey(user?.uid, reconciliationId),
        response,
      )
      queryClient.invalidateQueries({ queryKey: reconciliationKey(user?.uid) })
    },
  })
}
