'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { hydrateTasklytic } from '@/components/project management/stores/hydrate'
import { usesTasklyticBackend } from '@/components/project management/lib/forms/publicFormApi'
import '@/components/project management/styles/tasklytic.css'

/** Minimal provider for public Tasklytic routes (no auth shell). */
export function TasklyticPublicProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(usesTasklyticBackend())

  useEffect(() => {
    if (usesTasklyticBackend()) return
    void hydrateTasklytic().then(() => setReady(true))
  }, [])

  if (!ready) {
    return (
      <div className="tasklytic-root flex min-h-screen items-center justify-center">
        <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>Loading…</p>
      </div>
    )
  }

  return <div className="tasklytic-root">{children}</div>
}
