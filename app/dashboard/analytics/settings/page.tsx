'use client'

import { useState } from 'react'
import { Building, FileText, Shield } from 'lucide-react'

import { PageHeader } from '@/components/ui/page-header'
import { AuditLogTab } from '@/components/analytics/settings/AuditLogTab'
import { ComplianceTab } from '@/components/analytics/settings/ComplianceTab'
import { FirmManagementTab } from '@/components/analytics/settings/FirmManagementTab'
import { cn } from '@/lib/utils'

type SettingsTab = 'firm' | 'compliance' | 'audit'

const NAV_ITEMS: { id: SettingsTab; label: string; icon: typeof Building }[] = [
  { id: 'firm', label: 'Firm management', icon: Building },
  { id: 'compliance', label: 'Compliance & security', icon: Shield },
  { id: 'audit', label: 'Audit logger', icon: FileText },
]

export default function AnalyticsSettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('firm')

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Platform settings"
        description="Manage firm membership, compliance controls, and the firm-wide audit log."
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <nav className="space-y-1 md:col-span-1">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition-colors',
                activeTab === id
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground-muted hover:bg-surface-muted',
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {label}
            </button>
          ))}
        </nav>

        <div className="space-y-6 md:col-span-2">
          {activeTab === 'firm' && <FirmManagementTab />}
          {activeTab === 'compliance' && <ComplianceTab />}
          {activeTab === 'audit' && <AuditLogTab />}
        </div>
      </div>
    </div>
  )
}
