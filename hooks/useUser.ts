'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, type UserResponse, type UsageStats } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

export function useUser() {
  const { user } = useAuth()
  
  return useQuery<UserResponse>({
    queryKey: ['user', user?.uid],
    queryFn: () => apiClient.getCurrentUser(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  
  return useMutation({
    mutationFn: (data: { display_name?: string }) => 
      apiClient.updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', user?.uid] })
    },
  })
}

export function useUserUsage() {
  const { user } = useAuth()
  
  return useQuery<UsageStats>({
    queryKey: ['user-usage', user?.uid],
    queryFn: () => apiClient.getUserUsage(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  })
}

// Re-export types for convenience
export type { UserResponse, UsageStats } from '@/lib/api'