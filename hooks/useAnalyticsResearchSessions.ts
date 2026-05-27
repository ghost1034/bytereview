'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import type { AnalyticsChatSessionUpdateRequest } from '@/lib/analytics/types'

export type ResearchBot = 'irs' | 'gaap'

const sessionsKey = (bot: ResearchBot, uid?: string) =>
  ['analytics', 'research-sessions', bot, uid] as const

const sessionKey = (bot: ResearchBot, sessionId: string | null | undefined, uid?: string) =>
  ['analytics', 'research-session', bot, sessionId, uid] as const

/** List the current user's chat sessions for a research bot (most recent first). */
export function useAnalyticsResearchSessions(bot: ResearchBot) {
  const { user } = useAuth()

  return useQuery({
    queryKey: sessionsKey(bot, user?.uid),
    queryFn: () => apiClient.listAnalyticsResearchSessions(bot),
    enabled: !!user,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

/** Fetch a single session's full transcript + uploaded documents. */
export function useAnalyticsResearchSession(bot: ResearchBot, sessionId: string | null) {
  const { user } = useAuth()

  return useQuery({
    queryKey: sessionKey(bot, sessionId, user?.uid),
    queryFn: () => apiClient.getAnalyticsResearchSession(bot, sessionId as string),
    enabled: !!user && !!sessionId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useUpdateAnalyticsResearchSession() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: ({
      bot,
      sessionId,
      data,
    }: {
      bot: ResearchBot
      sessionId: string
      data: AnalyticsChatSessionUpdateRequest
    }) => apiClient.updateAnalyticsResearchSession(bot, sessionId, data),
    onSuccess: (_result, { bot, sessionId }) => {
      queryClient.invalidateQueries({ queryKey: sessionsKey(bot, user?.uid) })
      queryClient.invalidateQueries({ queryKey: sessionKey(bot, sessionId, user?.uid) })
    },
  })
}

export function useDeleteAnalyticsResearchSession() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: ({ bot, sessionId }: { bot: ResearchBot; sessionId: string }) =>
      apiClient.deleteAnalyticsResearchSession(bot, sessionId),
    onSuccess: (_result, { bot }) =>
      queryClient.invalidateQueries({ queryKey: sessionsKey(bot, user?.uid) }),
  })
}
