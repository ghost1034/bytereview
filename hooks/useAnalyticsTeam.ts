'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient, ApiError } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import type {
  AnalyticsFirmCreateRequest,
  AnalyticsFirmJoinRequest,
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

const onboardingKey = (uid?: string) => ['analytics', 'firm-onboarding', uid] as const

export function useAnalyticsFirmOnboardingStatus(options?: { enabled?: boolean }) {
  const { user } = useAuth()
  const enabled = (options?.enabled ?? true) && !!user

  return useQuery({
    queryKey: onboardingKey(user?.uid),
    queryFn: async () => {
      try {
        return await apiClient.getAnalyticsFirmOnboardingStatus()
      } catch (error) {
        // Older backend processes may not have the onboarding route yet. If the
        // user already has a firm, allow analytics modules to load normally.
        if (error instanceof ApiError && error.status === 404 && error.message === 'Not Found') {
          try {
            const firm = await apiClient.getCurrentAnalyticsFirm()
            return { needs_onboarding: false, firm: firm.firm }
          } catch (firmError) {
            if (firmError instanceof ApiError && firmError.status === 403) {
              return { needs_onboarding: true }
            }
            throw firmError
          }
        }
        throw error
      }
    },
    enabled,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useCreateAnalyticsFirm() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (data: AnalyticsFirmCreateRequest) => apiClient.createAnalyticsFirm(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: firmKey(user?.uid) })
      queryClient.invalidateQueries({ queryKey: onboardingKey(user?.uid) })
    },
  })
}

export function useJoinAnalyticsFirm() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (data: AnalyticsFirmJoinRequest) => apiClient.joinAnalyticsFirm(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: firmKey(user?.uid) })
      queryClient.invalidateQueries({ queryKey: onboardingKey(user?.uid) })
    },
  })
}

export function useGenerateFirmInviteCode() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: () => apiClient.generateAnalyticsFirmInviteCode(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: firmKey(user?.uid) }),
  })
}
