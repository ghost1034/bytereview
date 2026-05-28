'use client'

import { PageHeader } from '@/components/ui/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AuditLogTab } from '@/components/analytics/settings/AuditLogTab'
import { ComplianceTab } from '@/components/analytics/settings/ComplianceTab'
import { FirmManagementTab } from '@/components/analytics/settings/FirmManagementTab'

export default function AnalyticsSettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Manage firm membership, compliance controls, and the firm-wide audit log."
      />

      <Tabs defaultValue="firm" className="space-y-6">
        <TabsList>
          <TabsTrigger value="firm">Firm management</TabsTrigger>
          <TabsTrigger value="compliance">Compliance &amp; security</TabsTrigger>
          <TabsTrigger value="audit">Audit logger</TabsTrigger>
        </TabsList>

        <TabsContent value="firm">
          <FirmManagementTab />
        </TabsContent>
        <TabsContent value="compliance">
          <ComplianceTab />
        </TabsContent>
        <TabsContent value="audit">
          <AuditLogTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
