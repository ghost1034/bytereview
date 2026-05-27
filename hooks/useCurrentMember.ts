/**
 * Resolves the current authenticated user's analytics membership in the firm.
 *
 * Returns a stable shape with the user's role plus convenience flags used by
 * analytics pages to gate write actions (defense-in-depth — server enforces).
 */
'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'
import type {
  AnalyticsFirmMember,
  AnalyticsUserRole,
} from '@/lib/analytics/types'

interface UseCurrentMemberResult {
  member: AnalyticsFirmMember | null
  role: AnalyticsUserRole | null
  isAdmin: boolean
  isManager: boolean
  isAnalyst: boolean
  isReviewer: boolean
  isViewer: boolean
  canWrite: boolean
  canRunLlm: boolean
  canApprove: boolean
  isLoading: boolean
}

const WRITER_ROLES: AnalyticsUserRole[] = ['admin', 'manager', 'analyst']
const LLM_ROLES: AnalyticsUserRole[] = ['admin', 'manager', 'analyst', 'reviewer']
const APPROVER_ROLES: AnalyticsUserRole[] = ['admin', 'manager', 'reviewer']

export function useCurrentMember(): UseCurrentMemberResult {
  const { user: firebaseUser } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'firm'],
    queryFn: () => apiClient.getCurrentAnalyticsFirm(),
    enabled: !!firebaseUser,
  })

  return useMemo(() => {
    const member =
      data?.members?.find((m) => m.user_id === firebaseUser?.uid) ?? null
    const role = (member?.role ?? null) as AnalyticsUserRole | null
    return {
      member,
      role,
      isAdmin: role === 'admin',
      isManager: role === 'manager',
      isAnalyst: role === 'analyst',
      isReviewer: role === 'reviewer',
      isViewer: role === 'viewer',
      canWrite: role !== null && WRITER_ROLES.includes(role),
      canRunLlm: role !== null && LLM_ROLES.includes(role),
      canApprove: role !== null && APPROVER_ROLES.includes(role),
      isLoading,
    }
  }, [data, firebaseUser?.uid, isLoading])
}
