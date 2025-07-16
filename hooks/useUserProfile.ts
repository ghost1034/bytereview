/**
 * React Query-based user profile management
 * Handles automatic sync between Firebase Auth and backend
 */
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'

export interface UserProfile {
  uid: string
  email: string
  display_name?: string
  photo_url?: string
  created_at: string
  updated_at: string
  // Stripe fields will be added when billing is implemented
}

/**
 * Main user profile hook with automatic sync
 * This replaces the old useUser hook and handles sync automatically
 */
export function useUserProfile() {
  const { user: firebaseUser } = useAuth()
  const queryClient = useQueryClient()

  return useQuery<UserProfile>({
    queryKey: ['user-profile', firebaseUser?.uid],
    queryFn: async () => {
      if (!firebaseUser) {
        throw new Error('No authenticated user')
      }

      // Sync user profile with current Firebase data
      const response = await apiClient.syncUserProfile({
        display_name: firebaseUser.displayName || undefined,
        photo_url: firebaseUser.photoURL || undefined
      })

      // Validate that sync worked properly
      if (firebaseUser.displayName && !response.display_name) {
        throw new Error('Profile sync failed - display name not saved')
      }

      return response
    },
    enabled: !!firebaseUser,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  })
}

/**
 * Hook for updating user profile
 */
export function useUpdateUserProfile() {
  const queryClient = useQueryClient()
  const { user: firebaseUser } = useAuth()

  return useMutation({
    mutationFn: async (profileData: { display_name?: string; photo_url?: string }) => {
      return apiClient.syncUserProfile(profileData)
    },
    onSuccess: (data) => {
      // Update the cache with new data
      queryClient.setQueryData(['user-profile', firebaseUser?.uid], data)
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['user-profile'] })
    },
  })
}

// Usage tracking hooks will be added when Stripe billing is implemented

/**
 * Simple hook to get current user data (cached)
 * Use this instead of the old useUser hook
 * Single source of truth: userProfile from backend
 */
export function useCurrentUser() {
  const { user: firebaseUser } = useAuth()
  const { data: userProfile, isLoading, error } = useUserProfile()

  return {
    user: userProfile, // Single source of truth - backend data only
    isLoading,
    error,
    isAuthenticated: !!firebaseUser,
  }
}