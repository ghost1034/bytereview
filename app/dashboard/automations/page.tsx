import { AutomationList } from "@/components/automations/AutomationList"
import { EmailAutomationGuide } from "@/components/automations/EmailAutomationGuide"

export default function AutomationsPage() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Automations List - Takes up 2/3 of the width */}
      <div className="lg:col-span-2">
        <AutomationList />
      </div>
      
      {/* Email Automation Guide - Takes up 1/3 of the width */}
      <div className="lg:col-span-1">
        <EmailAutomationGuide />
      </div>
    </div>
  )
}