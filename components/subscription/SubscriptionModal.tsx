import { Check, CreditCard, Loader2 } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import {
  useCreateCheckoutSession,
  useSubscriptionPlans,
} from '@/hooks/useBilling'
import { cn } from '@/lib/utils'

interface SubscriptionModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function SubscriptionModal({
  isOpen,
  onClose,
}: SubscriptionModalProps) {
  const { user } = useAuth()
  const { data: plans, isLoading } = useSubscriptionPlans()
  const createCheckoutSession = useCreateCheckoutSession()

  const getPlanPrice = (planCode: string) => {
    switch (planCode) {
      case 'basic':
        return '$9.99'
      case 'pro':
        return '$49.99'
      default:
        return 'Free'
    }
  }

  const getPlanFeatures = (
    planCode: string,
    pagesIncluded: number,
    tokensIncluded: number,
    automationsLimit: number,
  ) => {
    const baseFeatures = [
      `${pagesIncluded === 999999 ? 'Unlimited' : pagesIncluded} pages per month`,
      `${tokensIncluded.toLocaleString()} platform AI tokens per month`,
      `Up to ${automationsLimit} automations`,
      'Custom extraction templates',
      'Export to CSV, Excel, Google Sheets',
    ]
    if (planCode === 'basic') {
      return [...baseFeatures, 'Email support', 'Standard processing speed']
    }
    if (planCode === 'pro') {
      return [
        ...baseFeatures,
        'Priority support',
        'Fast processing speed',
        'API access',
        'Advanced integrations',
      ]
    }
    return baseFeatures
  }

  const handleSelectPlan = (planCode: string) => {
    if (!user) {
      onClose()
      return
    }
    createCheckoutSession.mutate({
      plan_code: planCode,
      success_url: `${window.location.origin}/dashboard?success=true`,
      cancel_url: `${window.location.origin}/pricing`,
    })
  }

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-center text-xl font-semibold">
              Choose your plan
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-foreground-muted">
            <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
            Loading plans…
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  const paidPlans = plans?.filter((plan) => plan.code !== 'free') || []

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-center text-xl font-semibold">
            Choose your plan
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 py-4 md:grid-cols-2">
          {paidPlans.map((plan) => {
            const isPro = plan.code === 'pro'
            return (
              <div
                key={plan.code}
                className={cn(
                  'rounded-lg border p-6 shadow-xs',
                  isPro
                    ? 'border-primary ring-2 ring-primary/15 bg-surface-raised'
                    : 'border-border bg-surface-raised',
                )}
              >
                {isPro && (
                  <div className="mb-4 rounded-full bg-primary px-3 py-1 text-center text-xs font-semibold text-primary-foreground">
                    MOST POPULAR
                  </div>
                )}

                <div className="mb-2 text-center">
                  <h3 className="mb-2 text-lg font-semibold text-foreground">
                    {plan.display_name}
                  </h3>
                  <div className="text-3xl font-semibold tabular-nums text-foreground">
                    {getPlanPrice(plan.code)}
                  </div>
                  <div className="text-sm text-foreground-muted">per month</div>
                </div>
                <div className="mb-5 text-center text-sm text-foreground-muted">
                  {plan.overage_cents > 0 ? (
                    <>
                      Overage:{' '}
                      {(plan.overage_cents / 100).toLocaleString('en-US', {
                        style: 'currency',
                        currency: 'USD',
                      })}{' '}
                      per page ·{' '}
                      {(plan.token_overage_cents / 100).toLocaleString('en-US', {
                        style: 'currency',
                        currency: 'USD',
                      })}{' '}
                      per 1,000 tokens
                    </>
                  ) : (
                    <>No overage allowed</>
                  )}
                </div>

                <div className="mb-6 space-y-2.5">
                  {getPlanFeatures(
                    plan.code,
                    plan.pages_included,
                    plan.tokens_included,
                    plan.automations_limit,
                  ).map((feature, featureIndex) => (
                    <div
                      key={featureIndex}
                      className="flex items-center gap-2.5 text-sm"
                    >
                      <Check
                        className="size-4 flex-shrink-0 text-success"
                        aria-hidden
                      />
                      <span className="text-foreground-muted">{feature}</span>
                    </div>
                  ))}
                </div>

                <Button
                  onClick={() => handleSelectPlan(plan.code)}
                  disabled={createCheckoutSession.isPending}
                  variant={isPro ? 'default' : 'outline'}
                  className="w-full"
                >
                  {createCheckoutSession.isPending ? (
                    <>
                      <Loader2
                        className="mr-1.5 size-4 animate-spin"
                        aria-hidden
                      />
                      Loading…
                    </>
                  ) : (
                    <>
                      <CreditCard className="mr-1.5 size-4" aria-hidden />
                      Get started
                    </>
                  )}
                </Button>
              </div>
            )
          })}
        </div>

        <div className="border-t border-border pt-4 text-center">
          <p className="text-xs text-foreground-muted">
            All plans include automatic billing • Cancel anytime
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
