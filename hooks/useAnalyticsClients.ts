'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import type {
  AnalyticsClientCreateRequest,
  AnalyticsClientUpdateRequest,
} from '@/lib/analytics/types'

const clientsKey = (uid?: string) => ['analytics', 'clients', uid] as const

export function useAnalyticsClients() {
  const { user } = useAuth()

  return useQuery({
    queryKey: clientsKey(user?.uid),
    queryFn: () => apiClient.listAnalyticsClients(),
    enabled: !!user,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useCreateAnalyticsClient() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (data: AnalyticsClientCreateRequest) => apiClient.createAnalyticsClient(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clientsKey(user?.uid) }),
  })
}

export function useUpdateAnalyticsClient() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: ({ clientId, data }: { clientId: string; data: AnalyticsClientUpdateRequest }) =>
      apiClient.updateAnalyticsClient(clientId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clientsKey(user?.uid) }),
  })
}

export function useDeleteAnalyticsClient() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (clientId: string) => apiClient.deleteAnalyticsClient(clientId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clientsKey(user?.uid) }),
  })
}
