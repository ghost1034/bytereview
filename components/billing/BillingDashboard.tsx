/**
 * Comprehensive billing dashboard component
 */
'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  Calendar,
  CreditCard,
  FileText,
  Sparkles,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Section } from '@/components/ui/section'
import { StatCard } from '@/components/ui/stat-card'
import {
  useBillingAccount,
  useCreateCheckoutSession,
  useSubscriptionPlans,
  useUsageStats,
} from '@/hooks/useBilling'
import UsageStats from '@/components/subscription/UsageStats'

export default function BillingDashboard() {
  const [, setSelectedPlan] = useState<string | null>(null)

  const { data: billingAccount, isLoading: billingLoading } = useBillingAccount()
  const { data: usage, isLoading: usageLoading } = useUsageStats()
  const { data: plans, isLoading: plansLoading } = useSubscriptionPlans()
  const createCheckoutSession = useCreateCheckoutSession()

  const handleUpgrade = (planCode: string) => {
    const successUrl = `${window.location.origin}/dashboard/settings?upgrade=success`
    const cancelUrl = `${window.location.origin}/dashboard/settings?upgrade=canceled`
    setSelectedPlan(planCode)
    createCheckoutSession.mutate({
      plan_code: planCode,
      success_url: successUrl,
      cancel_url: cancelUrl,
    })
  }

  if (billingLoading || usageLoading || plansLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="space-y-3 rounded-lg border border-border bg-surface-raised p-5 shadow-xs"
          >
            <div className="flex items-start justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="size-7 rounded-md" />
            </div>
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
    )
  }

  if (!billingAccount || !usage) {
    return (
      <p className="py-8 text-center text-sm text-foreground-muted">
        Unable to load billing information.
      </p>
    )
  }

  const pagesPercentage =
    usage.pages_included > 0
      ? Math.min(100, (usage.pages_used / usage.pages_included) * 100)
      : 0
  const tokensPercentage =
    usage.tokens_included > 0
      ? Math.min(100, (usage.tokens_used / usage.tokens_included) * 100)
      : 0
  const isOverPageLimit = usage.pages_used >= usage.pages_included
  const isOverTokenLimit = usage.tokens_used >= usage.tokens_included

  const daysRemaining = usage.period_end
    ? Math.max(
        0,
        Math.ceil(
          (new Date(usage.period_end).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24),
        ),
      )
    : 0

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={CreditCard}
          label="Current plan"
          value={usage.plan_display_name}
          hint={
            billingAccount.plan_code === 'free'
              ? 'Free forever'
              : 'Billed monthly'
          }
        />
        <StatCard
          icon={FileText}
          label="Pages used"
          value={
            <span className="inline-flex items-center gap-2">
              {usage.pages_used.toLocaleString()}
              {isOverPageLimit && (
                <AlertTriangle
                  className="size-4 text-warning"
                  aria-hidden
                />
              )}
            </span>
          }
          hint={`of ${usage.pages_included.toLocaleString()} included`}
        />
        <StatCard
          icon={Sparkles}
          label="Tokens used"
          value={
            <span className="inline-flex items-center gap-2">
              {usage.tokens_used.toLocaleString()}
              {isOverTokenLimit && (
                <AlertTriangle
                  className="size-4 text-warning"
                  aria-hidden
                />
              )}
            </span>
          }
          hint={`of ${usage.tokens_included.toLocaleString()} included`}
        />
        <StatCard
          icon={Calendar}
          label="Billing period"
          value={daysRemaining}
          hint="days remaining"
        />
      </div>

      {/* Inline progress bars below the headline tiles */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-foreground-muted">
            <span>Pages this period</span>
            <span className="tabular-nums">
              {Math.round(pagesPercentage)}%
            </span>
          </div>
          <Progress value={pagesPercentage} className="h-1.5" />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-foreground-muted">
            <span>Platform AI tokens this period</span>
            <span className="tabular-nums">
              {Math.round(tokensPercentage)}%
            </span>
          </div>
          <Progress value={tokensPercentage} className="h-1.5" />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <UsageStats />

        <Section variant="card" title="Available plans">
          <div className="space-y-3">
            {plans
              ?.filter((plan) => plan.code !== 'free')
              .map((plan) => {
                const isCurrent = billingAccount.plan_code === plan.code
                return (
                  <div
                    key={plan.code}
                    className="flex items-center justify-between rounded-lg border border-border bg-surface-raised p-3 shadow-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-medium text-foreground">
                        {plan.display_name}
                      </h4>
                      <p className="text-xs text-foreground-muted">
                        {plan.pages_included.toLocaleString()} pages,{' '}
                        {plan.tokens_included.toLocaleString()} tokens,{' '}
                        {plan.automations_limit} automation slots
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 pl-3 text-right">
                      <div className="text-sm font-semibold text-foreground">
                        {plan.code === 'basic' ? '$9.99' : '$49.99'}
                        <span className="text-xs font-normal text-foreground-muted">
                          /mo
                        </span>
                      </div>
                      <div className="text-[11px] text-foreground-subtle">
                        {plan.overage_cents > 0 ? (
                          <>
                            Overage:{' '}
                            {(plan.overage_cents / 100).toLocaleString(
                              'en-US',
                              { style: 'currency', currency: 'USD' },
                            )}{' '}
                            / page
                            <br />
                            {(plan.token_overage_cents / 100).toLocaleString(
                              'en-US',
                              { style: 'currency', currency: 'USD' },
                            )}{' '}
                            / 1,000 tokens
                          </>
                        ) : (
                          'No overage allowed'
                        )}
                      </div>
                      {isCurrent ? (
                        <Badge variant="default">Current</Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleUpgrade(plan.code)}
                          disabled={createCheckoutSession.isPending}
                        >
                          {billingAccount.plan_code === 'free'
                            ? 'Upgrade'
                            : 'Switch'}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>
        </Section>
      </div>
    </div>
  )
}
