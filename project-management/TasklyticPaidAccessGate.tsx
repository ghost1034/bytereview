'use client'

import { useState, type ReactNode } from 'react'
import { CreditCard, FolderKanban, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import SubscriptionModal from '@/components/subscription/SubscriptionModal'
import { useBillingAccount } from '@/hooks/useBilling'

export function isPaidTasklyticPlan(planCode: string | null | undefined) {
  const normalized = planCode?.trim().toLowerCase()
  return Boolean(normalized && normalized !== 'free')
}

export function TasklyticPaidAccessGate({ children }: { children: ReactNode }) {
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const { data: billingAccount, isLoading, isFetching, error, refetch } = useBillingAccount()

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-sm text-foreground-muted">
        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
        Checking Tasklytic access…
      </div>
    )
  }

  if (billingAccount && isPaidTasklyticPlan(billingAccount.plan_code)) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-[420px] items-center justify-center px-4 py-10">
      <section className="w-full max-w-lg rounded-xl border border-border bg-surface-raised p-8 text-center shadow-sm">
        <span className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          {error ? <CreditCard className="size-6" aria-hidden /> : <FolderKanban className="size-6" aria-hidden />}
        </span>
        <h1 className="text-xl font-semibold text-foreground">
          {error ? 'We could not verify your plan' : 'Upgrade to use Tasklytic'}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-foreground-muted">
          {error
            ? 'Your subscription details are temporarily unavailable. Try checking again before opening Tasklytic.'
            : 'Tasklytic is available with any paid CPAAutomation plan. Upgrade to plan client work, manage teams, track time, and report on delivery.'}
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          {error ? (
            <Button type="button" disabled={isFetching} onClick={() => void refetch()}>
              {isFetching ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Check again
            </Button>
          ) : (
            <Button type="button" onClick={() => setUpgradeOpen(true)}>
              <CreditCard className="size-4" aria-hidden />
              View paid plans
            </Button>
          )}
        </div>
      </section>

      <SubscriptionModal
        isOpen={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
      />
    </div>
  )
}
