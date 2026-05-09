import { AutomationList } from '@/components/automations/AutomationList'
import { EmailAutomationGuide } from '@/components/automations/EmailAutomationGuide'
import { PageHeader } from '@/components/ui/page-header'

export default function AutomationsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Automations"
        description="Trigger jobs automatically when documents arrive in your inbox or other connected sources."
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AutomationList />
        </div>
        <div className="lg:col-span-1">
          <EmailAutomationGuide />
        </div>
      </div>
    </div>
  )
}
