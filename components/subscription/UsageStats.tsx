'use client'

import { Progress } from "@/components/ui/progress"
import { useUserUsage } from "@/hooks/useUser"
import { useTemplates } from "@/hooks/useExtraction"

interface UserUsageData {
  pages_used: number
  pages_limit: number
  subscription_status: string
  usage_percentage: number
}

interface TemplatesData {
  templates: Array<{
    id: string
    name: string
    description?: string
    fields: any[]
    created_at: string
    usage_count?: number
  }>
}

interface UsageStatsProps {
  className?: string
}

export default function UsageStats({ className = '' }: UsageStatsProps) {
  const { data: usageData } = useUserUsage()
  const { data: templatesData } = useTemplates()
  
  // Type-safe access to the data
  const typedUsageData = usageData as UserUsageData | undefined
  const typedTemplatesData = templatesData as TemplatesData | undefined

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">Pages Used This Month</span>
        <div className="flex items-center space-x-2">
          <Progress value={((typedUsageData?.pages_used || 0) / (typedUsageData?.pages_limit || 10)) * 100} className="w-24 h-2" />
          <span className="text-sm font-medium text-gray-900">{typedUsageData?.pages_used || 0}/{typedUsageData?.pages_limit || 10}</span>
        </div>
      </div>
      
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">Templates Created</span>
        <span className="text-sm font-medium text-gray-900">{typedTemplatesData?.templates?.length || 0}</span>
      </div>
      
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">Total Extractions</span>
        <span className="text-sm font-medium text-gray-900">{typedUsageData?.pages_used || 0}</span>
      </div>
    </div>
  )
}