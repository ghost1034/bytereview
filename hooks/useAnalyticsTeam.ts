'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import type {
  AnalyticsFirmInviteRequest,
  AnalyticsFirmUpdateRequest,
  AnalyticsMemberUpdateRequest,
} from '@/lib/analytics/types'

const firmKey = (uid?: string) => ['analytics', 'firm', uid] as const

/** Returns the current firm plus its member list. */
export function useAnalyticsFirm() {
  const { user } = useAuth()

  return useQuery({
    queryKey: firmKey(user?.uid),
    queryFn: () => apiClient.getCurrentAnalyticsFirm(),
    enabled: !!user,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useUpdateFirm() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (data: AnalyticsFirmUpdateRequest) => apiClient.updateAnalyticsFirm(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: firmKey(user?.uid) }),
  })
}

export function useInviteFirmMember() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (data: AnalyticsFirmInviteRequest) => apiClient.inviteAnalyticsFirmMember(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: firmKey(user?.uid) }),
  })
}

export function useUpdateFirmMember() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: ({
      memberUserId,
      data,
    }: {
      memberUserId: string
      data: AnalyticsMemberUpdateRequest
    }) => apiClient.updateAnalyticsFirmMember(memberUserId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: firmKey(user?.uid) }),
  })
}

export function useRemoveFirmMember() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (memberUserId: string) => apiClient.removeAnalyticsFirmMember(memberUserId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: firmKey(user?.uid) }),
  })
}
