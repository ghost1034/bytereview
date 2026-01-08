/**
 * React hooks for CPE Tracker feature
 */
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, CpeStatesListResponse, CpeSheetsListResponse, CreateCpeSheetResponse, StartCpeSheetResponse } from '@/lib/api'

/**
 * Hook to get available CPE states (templates)
 */
export function useCpeStates() {
  return useQuery<CpeStatesListResponse>({
    queryKey: ['cpe-states'],
    queryFn: () => apiClient.getCpeStates(),
    staleTime: 5 * 60 * 1000, // States don't change often
  })
}

/**
 * Hook to list user's CPE sheets
 */
export function useCpeSheets() {
  return useQuery<CpeSheetsListResponse>({
    queryKey: ['cpe-sheets'],
    queryFn: () => apiClient.listCpeSheets(),
  })
}

/**
 * Hook to create a new CPE sheet
 */
export function useCreateCpeSheet() {
  const queryClient = useQueryClient()

  return useMutation<CreateCpeSheetResponse, Error, { templateId: string; name?: string }>({
    mutationFn: ({ templateId, name }) => apiClient.createCpeSheet(templateId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cpe-sheets'] })
    },
  })
}

/**
 * Hook to delete a CPE sheet
 */
export function useDeleteCpeSheet() {
  const queryClient = useQueryClient()

  return useMutation<{ message: string }, Error, string>({
    mutationFn: (jobId) => apiClient.deleteCpeSheet(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cpe-sheets'] })
    },
  })
}

/**
 * Hook to start CPE sheet processing
 */
export function useStartCpeSheet() {
  const queryClient = useQueryClient()

  return useMutation<StartCpeSheetResponse, Error, string>({
    mutationFn: (jobId) => apiClient.startCpeSheet(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cpe-sheets'] })
    },
  })
}
