'use client'

/** PSA reports page wrapper. */
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { PsaReportsDashboard } from './reports/PsaReportsDashboard'
import { BillingRatesPanel } from './billing/BillingRatesPanel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function ReportsPage() {
  const { workspaceId } = useWorkspaceContext()
  usePageMeta({ breadcrumbs: [{ label: 'PSA Reports' }] })
  if (!workspaceId) return null
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl">PSA reporting</h1>
      <Tabs defaultValue="dashboard">
        <TabsList><TabsTrigger value="dashboard">Dashboards</TabsTrigger><TabsTrigger value="rates">Billing rates</TabsTrigger></TabsList>
        <TabsContent value="dashboard"><PsaReportsDashboard workspaceId={workspaceId} /></TabsContent>
        <TabsContent value="rates"><BillingRatesPanel workspaceId={workspaceId} /></TabsContent>
      </Tabs>
    </div>
  )
}
