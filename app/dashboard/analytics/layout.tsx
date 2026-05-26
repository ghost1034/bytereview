import type { ReactNode } from 'react'

import { AIAssistant } from '@/components/analytics/AIAssistant'

export default function AnalyticsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <AIAssistant />
    </>
  )
}
