/**
 * Real-time usage statistics component with billing integration
 */
'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertTriangle, FileText, Zap } from "lucide-react"
import { useUsageStats } from "@/hooks/useBilling"

export default function UsageStats() {
  const { data: usage, isLoading, error } = useUsageStats()

  if (isLoading) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Usage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Plan</span>
            <Skeleton className="h-5 w-16" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    )
  }

  if (error || !usage) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Usage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Plan</span>
            <Badge variant="secondary">Unknown</Badge>
          </div>
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">
              Unable to load usage data
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const pagesPercentage = usage.pages_included > 0 
    ? Math.min(100, (usage.pages_used / usage.pages_included) * 100)
    : 0

  const isNearLimit = pagesPercentage >= 80
  const isOverLimit = usage.pages_used >= usage.pages_included

  const getPlanBadgeVariant = (planCode: string) => {
    switch (planCode) {
      case 'free': return 'secondary'
      case 'basic': return 'default'
      case 'pro': return 'default'
      default: return 'secondary'
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Usage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Plan */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Plan</span>
          <Badge variant={getPlanBadgeVariant(usage.plan_code)}>
            {usage.plan_display_name}
          </Badge>
        </div>

        {/* Pages Usage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Pages</span>
            </div>
            <div className="flex items-center gap-1">
              {isOverLimit && <AlertTriangle className="h-4 w-4 text-orange-500" />}
              <span className="text-sm font-medium">
                {usage.pages_used.toLocaleString()} / {usage.pages_included.toLocaleString()}
              </span>
            </div>
          </div>
          <Progress 
            value={pagesPercentage} 
            className={`h-2 ${isOverLimit ? 'bg-orange-100' : isNearLimit ? 'bg-yellow-100' : ''}`}
          />
          <p className="text-xs text-muted-foreground">
            {usage.pages_remaining > 0 
              ? `${usage.pages_remaining.toLocaleString()} pages remaining`
              : usage.plan_code === 'free' 
                ? 'Limit reached - upgrade to continue'
                : `${(usage.pages_used - usage.pages_included).toLocaleString()} pages over limit`
            }
          </p>
          {isOverLimit && usage.plan_code !== 'free' && usage.overage_cents > 0 && (
            <p className="text-xs text-blue-600">
              Overage: {(usage.pages_used - usage.pages_included).toLocaleString()} × {(usage.overage_cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} = {(((usage.pages_used - usage.pages_included) * (usage.overage_cents / 100))).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
            </p>
          )}
        </div>

        {/* Automations */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Automations</span>
            </div>
            <span className="text-sm font-medium">
              {usage.automations_count} / {usage.automations_limit}
            </span>
          </div>
          <Progress 
            value={usage.automations_limit > 0 ? (usage.automations_count / usage.automations_limit) * 100 : 0}
            className="h-2"
          />
          <p className="text-xs text-muted-foreground">
            {usage.automations_limit === 0 
              ? 'Upgrade to enable automations'
              : usage.automations_count >= usage.automations_limit
                ? 'Limit reached - upgrade for more'
                : `${usage.automations_limit - usage.automations_count} slots available`
            }
          </p>
        </div>

        {/* Billing Period */}
        {usage.period_start && usage.period_end && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              Period: {new Date(usage.period_start).toLocaleDateString()} - {new Date(usage.period_end).toLocaleDateString()}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}