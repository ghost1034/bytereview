import type { ReactNode } from 'react'

import { AIAssistant } from '@/components/analytics/AIAssistant'
import { AnalyticsFirmGate } from '@/components/analytics/AnalyticsFirmGate'

export default function AnalyticsLayout({ children }: { children: ReactNode }) {
  return (
    <AnalyticsFirmGate>
      {children}
      <AIAssistant />
    </AnalyticsFirmGate>
  )
}
