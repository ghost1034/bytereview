'use client'

import { Progress } from "@/components/ui/progress"
import { useUserUsage, type UsageStats } from "@/hooks/useUser"
import { useTemplates, type TemplatesResponse } from "@/hooks/useExtraction"

interface UsageStatsProps {
  className?: string
}

export default function UsageStats({ className = '' }: UsageStatsProps) {
  const { data: usageData } = useUserUsage()
  const { data: templatesData } = useTemplates()
  
  // Data is now properly typed from the hooks

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">Pages Used This Month</span>
        <div className="flex items-center space-x-2">
          <Progress value={((usageData?.pages_used || 0) / (usageData?.pages_limit || 10)) * 100} className="w-24 h-2" />
          <span className="text-sm font-medium text-gray-900">{usageData?.pages_used || 0}/{usageData?.pages_limit || 10}</span>
        </div>
      </div>
      
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">Templates Created</span>
        <span className="text-sm font-medium text-gray-900">{templatesData?.templates?.length || 0}</span>
      </div>
      
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">Total Extractions</span>
        <span className="text-sm font-medium text-gray-900">{usageData?.pages_used || 0}</span>
      </div>
    </div>
  )
}