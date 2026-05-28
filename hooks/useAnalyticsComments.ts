'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import type {
  AnalyticsCommentCreateRequest,
  AnalyticsCommentUpdateRequest,
} from '@/lib/analytics/types'

const commentsKey = (uid: string | undefined, entityType: string, entityId: string) =>
  ['analytics', 'comments', uid, entityType, entityId] as const

export function useAnalyticsComments(entityType: string | null | undefined, entityId: string | null | undefined) {
  const { user } = useAuth()
  const enabled = !!user && !!entityType && !!entityId

  return useQuery({
    queryKey: commentsKey(user?.uid, entityType ?? '', entityId ?? ''),
    queryFn: () => apiClient.listAnalyticsComments(entityType as string, entityId as string),
    enabled,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useCreateAnalyticsComment() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (data: AnalyticsCommentCreateRequest) => apiClient.createAnalyticsComment(data),
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({
        queryKey: commentsKey(user?.uid, variables.entity_type, variables.entity_id),
      })
    },
  })
}

export function useUpdateAnalyticsComment(entityType: string, entityId: string) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: ({
      commentId,
      data,
    }: {
      commentId: string
      data: AnalyticsCommentUpdateRequest
    }) => apiClient.updateAnalyticsComment(commentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: commentsKey(user?.uid, entityType, entityId),
      })
    },
  })
}

export function useDeleteAnalyticsComment(entityType: string, entityId: string) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (commentId: string) => apiClient.deleteAnalyticsComment(commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: commentsKey(user?.uid, entityType, entityId),
      })
    },
  })
}
