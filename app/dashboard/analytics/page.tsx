'use client'

import { PageHeader } from '@/components/ui/page-header'
import { DashboardModule } from '@/components/analytics/dashboard/DashboardModule'

export default function AnalyticsDashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="At-a-glance view of variance and reconciliation projects across your firm."
      />
      <DashboardModule />
    </div>
  )
}
