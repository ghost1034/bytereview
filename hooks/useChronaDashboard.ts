'use client'

import { useQuery } from '@tanstack/react-query'

import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const summaryKey = (uid?: string, from?: string, to?: string, deviceId?: string) =>
  ['chrona', 'summary', uid, from, to, deviceId ?? 'all'] as const
const timelineKey = (uid?: string, deviceId?: string, day?: string) =>
  ['chrona', 'timeline', uid, deviceId, day] as const

/** Hours per (device, category, day) plus per-device totals for a date range.
 *  `from`/`to` are device-local days (YYYY-MM-DD), inclusive. */
export function useChronaSummary(options: { from: string; to: string; deviceId?: string }) {
  const { user } = useAuth()

  return useQuery({
    queryKey: summaryKey(user?.uid, options.from, options.to, options.deviceId),
    queryFn: () =>
      apiClient.getChronaSummary({
        from: options.from,
        to: options.to,
        deviceId: options.deviceId,
      }),
    enabled: !!user && !!options.from && !!options.to,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  })
}

/** Ordered timeline cards for one device on one device-local day. */
export function useChronaTimeline(options: { deviceId?: string; day?: string }) {
  const { user } = useAuth()

  return useQuery({
    queryKey: timelineKey(user?.uid, options.deviceId, options.day),
    queryFn: () =>
      apiClient.getChronaTimeline({ deviceId: options.deviceId!, day: options.day! }),
    enabled: !!user && !!options.deviceId && !!options.day,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  })
}
