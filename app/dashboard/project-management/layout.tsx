import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { TasklyticChrome } from '@/project-management/TasklyticChrome'
import { TasklyticProvider } from '@/project-management/TasklyticProvider'

export const metadata: Metadata = {
  title: 'AI Productivity Suite',
  description: 'Plan client work, manage teams, track time, and report on delivery.',
}

export default function ProjectManagementLayout({ children }: { children: ReactNode }) {
  return (
    <TasklyticProvider>
      <TasklyticChrome>{children}</TasklyticChrome>
    </TasklyticProvider>
  )
}
