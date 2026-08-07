'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { pbcApi } from '@/lib/pbc/api'

export function usePbcDashboard() {
  const { user } = useAuth()
  return useQuery({ queryKey: ['pbc', 'dashboard', user?.uid], queryFn: pbcApi.dashboard, enabled: !!user })
}

export function usePbcEngagements() {
  const { user } = useAuth()
  return useQuery({ queryKey: ['pbc', 'engagements', user?.uid], queryFn: pbcApi.engagements, enabled: !!user })
}

export function usePbcEngagement(id: string) {
  const { user } = useAuth()
  return useQuery({ queryKey: ['pbc', 'engagement', id, user?.uid], queryFn: () => pbcApi.engagement(id), enabled: !!user && !!id })
}

export function useInvalidatePbc() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: ['pbc'] })
}

export function useCreatePbcEngagement() {
  const invalidate = useInvalidatePbc()
  return useMutation({ mutationFn: pbcApi.createEngagement, onSuccess: invalidate })
}

