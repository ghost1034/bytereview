'use client'

import { useMemo } from 'react'

import { useAuth as usePlatformAuth } from '@/contexts/AuthContext'
import { useUserProfile } from '@/hooks/useUserProfile'
import type { UserOut } from '@/taxatlas-ui/lib/types'

export function useAuth() {
  const { user: firebaseUser, loading } = usePlatformAuth()
  const { data: profile, isLoading } = useUserProfile()

  return useMemo(() => {
    const user: UserOut | null = firebaseUser
      ? {
          id: firebaseUser.uid,
          email: profile?.email ?? firebaseUser.email ?? '',
          full_name: profile?.display_name ?? firebaseUser.displayName ?? profile?.email ?? '',
          organization: 'CPAAutomation',
          role: profile?.is_system_admin ? 'admin' : 'viewer',
          is_active: true,
          created_at: profile?.created_at ?? new Date(0).toISOString(),
        }
      : null
    return {
      user,
      loading: loading || isLoading,
      isAdmin: Boolean(profile?.is_system_admin),
    }
  }, [firebaseUser, loading, isLoading, profile])
}
