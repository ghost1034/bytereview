'use client'

/** Presence state derived from a user's lastActiveAt timestamp. */
import { useUsersStore } from '../stores/entities'

export type PresenceState = 'active' | 'idle' | 'offline'

const ACTIVE_MS = 5 * 60 * 1000
const IDLE_MS = 30 * 60 * 1000

/** Maps lastActiveAt to active / idle / offline presence. */
export function presenceFromLastActive(lastActiveAt?: string): PresenceState {
  if (!lastActiveAt) return 'offline'
  const elapsed = Date.now() - new Date(lastActiveAt).getTime()
  if (elapsed <= ACTIVE_MS) return 'active'
  if (elapsed <= IDLE_MS) return 'idle'
  return 'offline'
}

/** Hook — presence for a user id based on stored lastActiveAt. */
export function usePresence(userId: string): PresenceState {
  const lastActiveAt = useUsersStore((s) => s.getById(userId)?.lastActiveAt)
  return presenceFromLastActive(lastActiveAt)
}
