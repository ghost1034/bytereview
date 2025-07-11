'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

export function useUser() {
  const { user } = useAuth()
  
  return useQuery({
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

interface UserUsageData {
  pages_used: number
  pages_limit: number
  subscription_status: string
  usage_percentage: number
}

export function useUserUsage() {
  const { user } = useAuth()
  
  return useQuery<UserUsageData>({
    queryKey: ['user-usage', user?.uid],
    queryFn: () => apiClient.getUserUsage() as Promise<UserUsageData>,
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes - data is considered fresh for 5 minutes
    refetchOnWindowFocus: false, // Don't refetch when user switches back to tab
    refetchOnMount: true, // Only refetch when component mounts
    // Remove automatic refetch interval - only update when needed
  })
}