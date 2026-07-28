'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { TasklyticChrome } from '@/components/project management/TasklyticChrome'
import { TasklyticProvider } from '@/components/project management/TasklyticProvider'

/**
 * Skips chrome for public form pages. ByteReview's dashboard already gates
 * access behind Firebase auth, so the authenticated app simply bridges that
 * session through TasklyticProvider — Tasklytic owns no auth/profile screens.
 */
export function TasklyticLayoutGate({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isPublic = pathname?.startsWith('/dashboard/tasklytic/public/')

  if (isPublic) {
    return <>{children}</>
  }

  return (
    <TasklyticProvider>
      <TasklyticChrome>{children}</TasklyticChrome>
    </TasklyticProvider>
  )
}
