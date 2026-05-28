'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import type { AnalyticsFirmExport } from '@/lib/analytics/types'

const auditLogsKey = (uid?: string) => ['analytics', 'audit-logs', uid] as const

export function useAuditLogs(limit = 50) {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...auditLogsKey(user?.uid), limit],
    queryFn: () => apiClient.listFirmAuditLogs(limit),
    enabled: !!user,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useExportFirmData() {
  return useMutation<AnalyticsFirmExport, Error, void>({
    mutationFn: () => apiClient.exportFirmData(),
  })
}

export function usePurgeFirm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.purgeFirm(),
    onSuccess: () => {
      // Wipe every analytics cache; the firm no longer exists.
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
    },
  })
}
