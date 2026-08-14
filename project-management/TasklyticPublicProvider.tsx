'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { hydrateTasklytic } from '@/project-management/stores/hydrate'
import { usesTasklyticBackend } from '@/project-management/lib/forms/publicFormApi'
import '@/project-management/styles/tasklytic-public.css'

/** Minimal provider for public Tasklytic routes (no auth shell). */
export function TasklyticPublicProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(usesTasklyticBackend())

  useEffect(() => {
    if (usesTasklyticBackend()) return
    void hydrateTasklytic().then(() => setReady(true))
  }, [])

  if (!ready) {
    return (
      <div className="tasklytic-public-root flex min-h-screen items-center justify-center">
        <p className="text-sm text-foreground-muted">Loading…</p>
      </div>
    )
  }

  return <div className="tasklytic-public-root">{children}</div>
}
