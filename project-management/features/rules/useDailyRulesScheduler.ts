'use client'

/** Run due-in-days rules on mount and every 30 minutes while the app is open. */
import { useEffect } from 'react'
import { runDueInDaysRules } from '../../lib/rulesEngine'
import { useAuthStore } from '../../stores/auth'

const INTERVAL_MS = 30 * 60 * 1000

export function useDailyRulesScheduler(): void {
  const actorId = useAuthStore((s) => s.currentUserId)

  useEffect(() => {
    if (!actorId) return

    void runDueInDaysRules(actorId)
    const id = window.setInterval(() => {
      void runDueInDaysRules(actorId)
    }, INTERVAL_MS)

    return () => window.clearInterval(id)
  }, [actorId])
}
