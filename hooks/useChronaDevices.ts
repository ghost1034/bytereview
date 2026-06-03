'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import type { ChronaPairingCodeCreateRequest } from '@/lib/chrona/types'

const devicesKey = (uid?: string) => ['chrona', 'devices', uid] as const
const pairingCodesKey = (uid?: string) => ['chrona', 'pairing-codes', uid] as const

/** Paired Chrona devices for the current firm. */
export function useChronaDevices() {
  const { user } = useAuth()

  return useQuery({
    queryKey: devicesKey(user?.uid),
    queryFn: () => apiClient.listChronaDevices(),
    enabled: !!user,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  })
}

/** Active (unconsumed, unexpired) pairing codes. */
export function useChronaPairingCodes() {
  const { user } = useAuth()

  return useQuery({
    queryKey: pairingCodesKey(user?.uid),
    queryFn: () => apiClient.listChronaPairingCodes(),
    enabled: !!user,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useGenerateChronaPairingCode() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (data: ChronaPairingCodeCreateRequest) =>
      apiClient.generateChronaPairingCode(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pairingCodesKey(user?.uid) }),
  })
}

export function useRenameChronaDevice() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: ({ deviceId, displayName }: { deviceId: string; displayName: string }) =>
      apiClient.renameChronaDevice(deviceId, { display_name: displayName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: devicesKey(user?.uid) })
      queryClient.invalidateQueries({ queryKey: ['chrona', 'summary'] })
    },
  })
}

export function useRevokeChronaDevice() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: ({ deviceId, purge }: { deviceId: string; purge?: boolean }) =>
      apiClient.revokeChronaDevice(deviceId, { purge }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: devicesKey(user?.uid) })
      queryClient.invalidateQueries({ queryKey: ['chrona', 'summary'] })
    },
  })
}
