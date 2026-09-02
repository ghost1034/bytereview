import type { ReactNode } from 'react'

import { AnalyticsSuiteBoundary } from '@/components/analytics/AnalyticsSuiteBoundary'

export default function AnalyticsLayout({ children }: { children: ReactNode }) {
  return <AnalyticsSuiteBoundary>{children}</AnalyticsSuiteBoundary>
}
