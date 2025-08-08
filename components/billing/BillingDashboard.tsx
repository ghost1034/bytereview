/**
 * Comprehensive billing dashboard component
 */
'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertTriangle, FileText, Zap, CreditCard, TrendingUp, Calendar } from "lucide-react"
import { useBillingAccount, useUsageStats, useSubscriptionPlans, useCreateCheckoutSession } from "@/hooks/useBilling"
import { useState } from "react"

export default function BillingDashboard() {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  
  const { data: billingAccount, isLoading: billingLoading } = useBillingAccount()
  const { data: usage, isLoading: usageLoading } = useUsageStats()
  const { data: plans, isLoading: plansLoading } = useSubscriptionPlans()
  const createCheckoutSession = useCreateCheckoutSession()

  const handleUpgrade = (planCode: string) => {
    const successUrl = `${window.location.origin}/dashboard/settings?upgrade=success`
    const cancelUrl = `${window.location.origin}/dashboard/settings?upgrade=canceled`
    
    createCheckoutSession.mutate({
      plan_code: planCode,
      success_url: successUrl,
      cancel_url: cancelUrl
    })
  }

  if (billingLoading || usageLoading || plansLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (!billingAccount || !usage) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Unable to load billing information</p>
      </div>
    )
  }

  const pagesPercentage = usage.pages_included > 0 
    ? Math.min(100, (usage.pages_used / usage.pages_included) * 100)
    : 0

  const automationsPercentage = usage.automations_limit > 0
    ? (usage.automations_count / usage.automations_limit) * 100
    : 0

  const isNearPageLimit = pagesPercentage >= 80
  const isOverPageLimit = usage.pages_used >= usage.pages_included
  const isNearAutomationLimit = automationsPercentage >= 80

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Current Plan */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Plan</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{usage.plan_display_name}</div>
            <p className="text-xs text-muted-foreground">
              {billingAccount.plan_code === 'free' ? 'Free forever' : 'Billed monthly'}
            </p>
          </CardContent>
        </Card>

        {/* Pages Used */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pages Used</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              {usage.pages_used.toLocaleString()}
              {isOverPageLimit && <AlertTriangle className="h-4 w-4 text-orange-500" />}
            </div>
            <p className="text-xs text-muted-foreground">
              of {usage.pages_included.toLocaleString()} included
            </p>
            <Progress value={pagesPercentage} className="mt-2 h-1" />
          </CardContent>
        </Card>

        {/* Automations */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Automations</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              {usage.automations_count}
              {isNearAutomationLimit && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
            </div>
            <p className="text-xs text-muted-foreground">
              of {usage.automations_limit} available
            </p>
            {usage.automations_limit > 0 && (
              <Progress value={automationsPercentage} className="mt-2 h-1" />
            )}
          </CardContent>
        </Card>

        {/* Billing Period */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Billing Period</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {usage.period_end ? Math.ceil((new Date(usage.period_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0}
            </div>
            <p className="text-xs text-muted-foreground">
              days remaining
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Usage Details */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Usage Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Usage Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Pages this period</span>
                <span className="font-medium">{usage.pages_used.toLocaleString()} / {usage.pages_included.toLocaleString()}</span>
              </div>
              <Progress value={pagesPercentage} className="h-2" />
              {isOverPageLimit && billingAccount.plan_code === 'free' && (
                <p className="text-xs text-orange-600">
                  You've reached your page limit. Upgrade to continue processing files.
                </p>
              )}
              {isOverPageLimit && billingAccount.plan_code !== 'free' && (
                <p className="text-xs text-blue-600">
                  Overage: {(usage.pages_used - usage.pages_included).toLocaleString()} pages at ${(billingAccount.overage_cents / 100).toFixed(2)}/page
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Active automations</span>
                <span className="font-medium">{usage.automations_count} / {usage.automations_limit}</span>
              </div>
              {usage.automations_limit > 0 && (
                <Progress value={automationsPercentage} className="h-2" />
              )}
              {usage.automations_limit === 0 && (
                <p className="text-xs text-muted-foreground">
                  Upgrade to enable automations
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Available Plans */}
        <Card>
          <CardHeader>
            <CardTitle>Available Plans</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {plans?.filter(plan => plan.code !== 'free').map((plan) => (
              <div key={plan.code} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <h4 className="font-medium">{plan.display_name}</h4>
                  <p className="text-sm text-muted-foreground">
                    {plan.pages_included.toLocaleString()} pages, {plan.automations_limit} automations
                  </p>
                </div>
                <div className="text-right">
                  <div className="font-medium">
                    {plan.code === 'basic' ? '$9.99' : '$49.99'}/mo
                  </div>
                  {billingAccount.plan_code !== plan.code && (
                    <Button 
                      size="sm" 
                      onClick={() => handleUpgrade(plan.code)}
                      disabled={createCheckoutSession.isPending}
                    >
                      {billingAccount.plan_code === 'free' ? 'Upgrade' : 'Switch'}
                    </Button>
                  )}
                  {billingAccount.plan_code === plan.code && (
                    <Badge variant="default">Current</Badge>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}