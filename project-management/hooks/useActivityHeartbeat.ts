'use client'

/** Heartbeat — updates current user's lastActiveAt every 60s while the tab is focused. */
import { useEffect } from 'react'
import { now } from '../lib/time'
import { useAuthStore } from '../stores/auth'
import { useUsersStore } from '../stores/entities'

const HEARTBEAT_MS = 60_000

export function useActivityHeartbeat(): void {
  const userId = useAuthStore((s) => s.currentUserId)

  useEffect(() => {
    if (!userId) return

    const tick = () => {
      if (document.visibilityState !== 'visible') return
      void useUsersStore.getState().update(userId, { lastActiveAt: now() })
    }

    tick()
    const id = window.setInterval(tick, HEARTBEAT_MS)
    const onFocus = () => tick()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)

    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [userId])
}
