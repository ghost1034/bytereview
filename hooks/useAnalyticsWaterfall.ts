'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import type {
  AnalyticsAnalysisCreateRequest,
  AnalyticsAnalysisUpdateRequest,
  AnalyticsWaterfallExtractRequest,
} from '@/lib/analytics/types'

const waterfallKey = (uid?: string) => ['analytics', 'waterfall', uid] as const
const waterfallItemKey = (uid: string | undefined, id: string) =>
  ['analytics', 'waterfall', uid, id] as const

export function useAnalyticsWaterfalls() {
  const { user } = useAuth()

  return useQuery({
    queryKey: waterfallKey(user?.uid),
    queryFn: () => apiClient.listAnalyticsWaterfalls(),
    enabled: !!user,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useAnalyticsWaterfall(analysisId: string | null | undefined) {
  const { user } = useAuth()

  return useQuery({
    queryKey: waterfallItemKey(user?.uid, analysisId ?? ''),
    queryFn: () => apiClient.getAnalyticsWaterfall(analysisId as string),
    enabled: !!user && !!analysisId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useCreateAnalyticsWaterfall() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (data: AnalyticsAnalysisCreateRequest) => apiClient.createAnalyticsWaterfall(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: waterfallKey(user?.uid) }),
  })
}

export function useUpdateAnalyticsWaterfall() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: ({ analysisId, data }: { analysisId: string; data: AnalyticsAnalysisUpdateRequest }) =>
      apiClient.updateAnalyticsWaterfall(analysisId, data),
    onSuccess: (_res, { analysisId }) => {
      queryClient.invalidateQueries({ queryKey: waterfallKey(user?.uid) })
      queryClient.invalidateQueries({ queryKey: waterfallItemKey(user?.uid, analysisId) })
    },
  })
}

export function useDeleteAnalyticsWaterfall() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (analysisId: string) => apiClient.deleteAnalyticsWaterfall(analysisId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: waterfallKey(user?.uid) }),
  })
}

/** LLM contract extraction — not cached (one-shot before the user edits the form). */
export function useExtractAnalyticsWaterfall() {
  return useMutation({
    mutationFn: (data: AnalyticsWaterfallExtractRequest) => apiClient.extractAnalyticsWaterfall(data),
  })
}
