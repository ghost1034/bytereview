'use client'

/** Returns the signed-in Tasklytic user entity, or null when unauthenticated. */
import { useAuthStore } from '../stores/auth'
import { useUsersStore } from '../stores/entities'
import type { User } from '../types'

export function useCurrentUser(): User | null {
  const userId = useAuthStore((s) => s.currentUserId)
  return useUsersStore((s) => (userId ? s.getById(userId) ?? null : null))
}
