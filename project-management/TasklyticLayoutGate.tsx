'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { TasklyticChrome } from '@/project-management/TasklyticChrome'
import { TasklyticPaidAccessGate } from '@/project-management/TasklyticPaidAccessGate'
import { TasklyticProvider } from '@/project-management/TasklyticProvider'

/**
 * Skips chrome for public form pages. CPAAutomation's dashboard already gates
 * access behind Firebase auth. Authenticated Tasklytic surfaces also require
 * a paid CPAAutomation plan before the workspace provider can boot.
 */
export function TasklyticLayoutGate({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isPublic = pathname?.startsWith('/project-management/forms/')

  if (isPublic) {
    return <>{children}</>
  }

  return (
    <TasklyticPaidAccessGate>
      <TasklyticProvider>
        <TasklyticChrome>{children}</TasklyticChrome>
      </TasklyticProvider>
    </TasklyticPaidAccessGate>
  )
}
