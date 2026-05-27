'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import type {
  AnalyticsProjectCreateRequest,
  AnalyticsProjectUpdateRequest,
} from '@/lib/analytics/types'

const projectsKey = (uid?: string) => ['analytics', 'projects', uid] as const

export function useAnalyticsProjects() {
  const { user } = useAuth()

  return useQuery({
    queryKey: projectsKey(user?.uid),
    queryFn: () => apiClient.listAnalyticsProjects(),
    enabled: !!user,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useCreateAnalyticsProject() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (data: AnalyticsProjectCreateRequest) => apiClient.createAnalyticsProject(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectsKey(user?.uid) }),
  })
}

export function useUpdateAnalyticsProject() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: ({ projectId, data }: { projectId: string; data: AnalyticsProjectUpdateRequest }) =>
      apiClient.updateAnalyticsProject(projectId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectsKey(user?.uid) }),
  })
}

export function useDeleteAnalyticsProject() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (projectId: string) => apiClient.deleteAnalyticsProject(projectId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectsKey(user?.uid) }),
  })
}
