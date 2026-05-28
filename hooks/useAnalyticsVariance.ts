'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import type {
  AnalyticsAnalysis,
  AnalyticsAnalysisCreateRequest,
  AnalyticsAnalysisUpdateRequest,
  AnalyticsVarianceAnalyzeRequest,
  AnalyticsVarianceMemoRequest,
  AnalyticsVarianceThresholdRequest,
} from '@/lib/analytics/types'

const varianceKey = (uid?: string) => ['analytics', 'variance', uid] as const
const varianceItemKey = (uid: string | undefined, id: string) =>
  ['analytics', 'variance', uid, id] as const

export function useAnalyticsVariances() {
  const { user } = useAuth()

  return useQuery({
    queryKey: varianceKey(user?.uid),
    queryFn: () => apiClient.listAnalyticsVariances(),
    enabled: !!user,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useAnalyticsVariance(analysisId: string | null | undefined) {
  const { user } = useAuth()

  return useQuery({
    queryKey: varianceItemKey(user?.uid, analysisId ?? ''),
    queryFn: () => apiClient.getAnalyticsVariance(analysisId as string),
    enabled: !!user && !!analysisId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useCreateAnalyticsVariance() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (data: AnalyticsAnalysisCreateRequest) => apiClient.createAnalyticsVariance(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: varianceKey(user?.uid) }),
  })
}

export function useUpdateAnalyticsVariance() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: ({
      analysisId,
      data,
    }: {
      analysisId: string
      data: AnalyticsAnalysisUpdateRequest
    }) => apiClient.updateAnalyticsVariance(analysisId, data),
    onSuccess: (response, { analysisId }) => {
      queryClient.setQueryData<AnalyticsAnalysis>(
        varianceItemKey(user?.uid, analysisId),
        response,
      )
      queryClient.invalidateQueries({ queryKey: varianceKey(user?.uid) })
    },
  })
}

export function useDeleteAnalyticsVariance() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (analysisId: string) => apiClient.deleteAnalyticsVariance(analysisId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: varianceKey(user?.uid) }),
  })
}

/** LLM: suggest materiality thresholds from a raw GL sample. */
export function useSuggestVarianceThreshold() {
  return useMutation({
    mutationFn: (data: AnalyticsVarianceThresholdRequest) =>
      apiClient.suggestVarianceThreshold(data),
  })
}

/** LLM: per-row explanations for flagged rows. */
export function useAnalyzeVariance() {
  return useMutation({
    mutationFn: (data: AnalyticsVarianceAnalyzeRequest) => apiClient.analyzeVariance(data),
  })
}

/** LLM: generate a markdown variance memo. */
export function useGenerateVarianceMemo() {
  return useMutation({
    mutationFn: (data: AnalyticsVarianceMemoRequest) => apiClient.generateVarianceMemo(data),
  })
}
