/**
 * Real-time usage statistics component with billing integration
 */
'use client'

import { AlertTriangle, FileText, Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Section } from '@/components/ui/section'
import { useUsageStats } from '@/hooks/useBilling'
import { cn, pluralize } from '@/lib/utils'

export default function UsageStats() {
  const { data: usage, isLoading, error } = useUsageStats()

  if (isLoading) {
    return (
      <Section variant="card" title="Usage">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground-muted">Plan</span>
            <Skeleton className="h-5 w-16" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </Section>
    )
  }

  if (error || !usage) {
    return (
      <Section variant="card" title="Usage">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground-muted">Plan</span>
            <Badge variant="secondary">Unknown</Badge>
          </div>
          <p className="py-4 text-center text-sm text-foreground-muted">
            Unable to load usage data
          </p>
        </div>
      </Section>
    )
  }

  const pagesPercentage =
    usage.pages_included > 0
      ? Math.min(100, (usage.pages_used / usage.pages_included) * 100)
      : 0

  const isNearLimit = pagesPercentage >= 80
  const isOverLimit = usage.pages_used >= usage.pages_included
  const tokensPercentage = usage.tokens_included > 0
    ? Math.min(100, (usage.tokens_used / usage.tokens_included) * 100)
    : 0
  const isNearTokenLimit = tokensPercentage >= 80
  const isOverTokenLimit = usage.tokens_used >= usage.tokens_included

  const getPlanBadgeVariant = (planCode: string) => {
    switch (planCode) {
      case 'free':
        return 'secondary'
      case 'basic':
      case 'pro':
        return 'default'
      default:
        return 'secondary'
    }
  }

  const overageAmount =
    isOverLimit && usage.overage_cents > 0
      ? ((usage.pages_used - usage.pages_included) * (usage.overage_cents / 100))
      : 0
  const tokenOverageAmount =
    isOverTokenLimit && usage.token_overage_cents > 0
      ? Math.ceil((usage.tokens_used - usage.tokens_included) / 1000) *
        (usage.token_overage_cents / 100)
      : 0

  return (
    <Section variant="card" title="Usage">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground-muted">Plan</span>
          <Badge variant={getPlanBadgeVariant(usage.plan_code)}>
            {usage.plan_display_name}
          </Badge>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <FileText className="size-3.5 text-foreground-muted" aria-hidden />
              <span className="text-sm text-foreground-muted">Pages</span>
            </div>
            <div className="flex items-center gap-1.5">
              {isOverLimit && (
                <AlertTriangle
                  className="size-3.5 text-warning"
                  aria-hidden
                />
              )}
              <span className="text-sm font-medium tabular-nums text-foreground">
                {usage.pages_used.toLocaleString()} /{' '}
                {usage.pages_included.toLocaleString()}
              </span>
            </div>
          </div>
          <Progress
            value={pagesPercentage}
            className={cn(
              'h-1.5',
              isOverLimit && '[&>div]:bg-destructive',
              !isOverLimit && isNearLimit && '[&>div]:bg-warning',
            )}
          />
          <p className="text-xs text-foreground-subtle">
            {usage.pages_remaining > 0
              ? `${usage.pages_remaining.toLocaleString()} ${pluralize(usage.pages_remaining, 'page')} remaining`
              : usage.plan_code === 'free'
                ? 'Limit reached — upgrade to continue'
                : `${(usage.pages_used - usage.pages_included).toLocaleString()} ${pluralize(usage.pages_used - usage.pages_included, 'page')} over limit`}
          </p>
          {isOverLimit && usage.plan_code !== 'free' && overageAmount > 0 && (
            <p className="text-xs text-primary">
              Overage:{' '}
              {(
                usage.pages_used - usage.pages_included
              ).toLocaleString()}{' '}
              ×{' '}
              {(usage.overage_cents / 100).toLocaleString('en-US', {
                style: 'currency',
                currency: 'USD',
              })}{' '}
              ={' '}
              {overageAmount.toLocaleString('en-US', {
                style: 'currency',
                currency: 'USD',
              })}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-foreground-muted" aria-hidden />
              <span className="text-sm text-foreground-muted">Platform AI tokens</span>
            </div>
            <div className="flex items-center gap-1.5">
              {isOverTokenLimit && <AlertTriangle className="size-3.5 text-warning" aria-hidden />}
              <span className="text-sm font-medium tabular-nums text-foreground">
                {usage.tokens_used.toLocaleString()} / {usage.tokens_included.toLocaleString()}
              </span>
            </div>
          </div>
          <Progress
            value={tokensPercentage}
            className={cn(
              'h-1.5',
              isOverTokenLimit && '[&>div]:bg-destructive',
              !isOverTokenLimit && isNearTokenLimit && '[&>div]:bg-warning',
            )}
          />
          <p className="text-xs text-foreground-subtle">
            {usage.token_billing_shadow
              ? `Shadow tracking until ${usage.token_billing_effective_at ? new Date(usage.token_billing_effective_at).toLocaleDateString() : 'your next period'} — no token charges yet`
              : usage.tokens_remaining > 0
                ? `${usage.tokens_remaining.toLocaleString()} tokens remaining`
                : usage.plan_code === 'free'
                  ? 'Limit reached — upgrade to continue using AI features'
                  : `${(usage.tokens_used - usage.tokens_included).toLocaleString()} tokens over limit`}
          </p>
          {tokenOverageAmount > 0 && !usage.token_billing_shadow && (
            <p className="text-xs text-primary">
              Estimated token overage: {tokenOverageAmount.toLocaleString('en-US', {
                style: 'currency',
                currency: 'USD',
              })}
            </p>
          )}
        </div>

        {Object.keys(usage.product_breakdown).length > 0 && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-medium text-foreground-muted">By module</p>
            {Object.entries(usage.product_breakdown).map(([product, totals]) => (
              <div key={product} className="flex justify-between gap-3 text-xs text-foreground-subtle">
                <span className="capitalize">{product.replace(/_/g, ' ')}</span>
                <span className="tabular-nums">
                  {totals.pages > 0 && `${totals.pages.toLocaleString()} ${pluralize(totals.pages, 'page')}`}
                  {totals.pages > 0 && totals.tokens > 0 && ' · '}
                  {totals.tokens > 0 && `${totals.tokens.toLocaleString()} tokens`}
                </span>
              </div>
            ))}
          </div>
        )}

        {usage.period_start && usage.period_end && (
          <div className="border-t border-border pt-3">
            <p className="text-xs text-foreground-subtle">
              Period:{' '}
              {new Date(usage.period_start).toLocaleDateString()} —{' '}
              {new Date(usage.period_end).toLocaleDateString()}
            </p>
          </div>
        )}
      </div>
    </Section>
  )
}
