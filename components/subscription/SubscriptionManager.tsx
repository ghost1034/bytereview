'use client'

import { useState } from 'react'
import { Calendar, CreditCard, Loader2 } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Section } from '@/components/ui/section'
import {
  useBillingAccount,
  useCreatePortalSession,
  useSubscriptionPlans,
} from '@/hooks/useBilling'
import { useToast } from '@/hooks/use-toast'
import { pluralize } from '@/lib/utils'
import SubscriptionModal from './SubscriptionModal'

export default function SubscriptionManager() {
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const { toast } = useToast()

  const { data: billingAccount, isLoading, error } = useBillingAccount()
  const { data: plans } = useSubscriptionPlans()
  const createPortalSession = useCreatePortalSession()

  const handleCancelSubscription = async () => {
    setIsCancelling(true)
    try {
      createPortalSession.mutate({ return_url: window.location.href })
    } catch {
      toast({
        title: 'Error',
        description:
          'Failed to open subscription management. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsCancelling(false)
    }
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'active':
        return 'default'
      case 'past_due':
        return 'destructive'
      default:
        return 'secondary'
    }
  }

  const getPlanPrice = (planCode: string) => {
    const plan = plans?.find((p) => p.code === planCode)
    if (!plan?.stripe_price_recurring_id) return null
    switch (planCode) {
      case 'basic':
        return '$9.99'
      case 'pro':
        return '$49.99'
      default:
        return null
    }
  }

  if (isLoading) {
    return (
      <Section
        variant="card"
        title={
          <span className="inline-flex items-center gap-2">
            <CreditCard className="size-4 text-foreground-muted" aria-hidden />
            Subscription
          </span>
        }
      >
        <div className="flex items-center gap-2 text-sm text-foreground-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading subscription details…
        </div>
      </Section>
    )
  }

  if (error || !billingAccount) {
    return (
      <Section
        variant="card"
        title={
          <span className="inline-flex items-center gap-2">
            <CreditCard className="size-4 text-foreground-muted" aria-hidden />
            Subscription
          </span>
        }
      >
        <p className="text-sm text-foreground-muted">
          Unable to load subscription details
        </p>
      </Section>
    )
  }

  if (billingAccount.plan_code === 'free') {
    return (
      <>
        <Section variant="card" title="Subscription">
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span
              className="flex size-12 items-center justify-center rounded-full bg-surface-muted ring-1 ring-border"
              aria-hidden
            >
              <CreditCard className="size-5 text-foreground-muted" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                No active subscription
              </p>
              <p className="text-xs text-foreground-muted">
                You&apos;re on the free plan ({billingAccount.pages_included}{' '}
                {pluralize(billingAccount.pages_included, 'page')}/month).
                Upgrade to unlock advanced features.
              </p>
            </div>
            <Button onClick={() => setIsSubscriptionModalOpen(true)}>
              Upgrade plan
            </Button>
          </div>
        </Section>

        <SubscriptionModal
          isOpen={isSubscriptionModalOpen}
          onClose={() => setIsSubscriptionModalOpen(false)}
        />
      </>
    )
  }

  return (
    <>
      <Section
        variant="card"
        title={
          <span className="inline-flex items-center gap-2">
            <CreditCard className="size-4 text-foreground-muted" aria-hidden />
            Active subscription
          </span>
        }
      >
        <div className="space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground-muted">Status</span>
            <Badge variant={getStatusVariant(billingAccount.status)}>
              {billingAccount.status === 'active'
                ? 'Active'
                : billingAccount.status === 'incomplete'
                  ? 'Payment Pending'
                  : billingAccount.status}
            </Badge>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground-muted">Plan</span>
            <span className="text-sm font-medium text-foreground">
              {billingAccount.plan_display_name}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground-muted">Page limit</span>
            <span className="text-sm font-medium tabular-nums text-foreground">
              {billingAccount.pages_included === 999999
                ? 'Unlimited'
                : `${billingAccount.pages_included} ${pluralize(billingAccount.pages_included, 'page')}/mo`}
            </span>
          </div>

          {getPlanPrice(billingAccount.plan_code) && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-muted">Price</span>
              <span className="text-sm font-medium text-foreground">
                {getPlanPrice(billingAccount.plan_code)}/month
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground-muted">Next billing</span>
            <span className="inline-flex items-center gap-1 text-sm text-foreground">
              <Calendar
                className="size-3.5 text-foreground-subtle"
                aria-hidden
              />
              {billingAccount.current_period_end
                ? new Date(
                    billingAccount.current_period_end,
                  ).toLocaleDateString()
                : 'Not available'}
            </span>
          </div>

          {billingAccount.stripe_subscription_id &&
            billingAccount.status === 'active' && (
              <div className="border-t border-border pt-4">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full border-destructive/30 text-destructive hover:bg-destructive-soft hover:text-destructive"
                      disabled={isCancelling}
                    >
                      {isCancelling ? 'Cancelling…' : 'Cancel subscription'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel subscription</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to cancel your subscription?
                        You&apos;ll lose access to premium features at the end
                        of your current billing period.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep subscription</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleCancelSubscription}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Yes, cancel
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
        </div>
      </Section>

      <SubscriptionModal
        isOpen={isSubscriptionModalOpen}
        onClose={() => setIsSubscriptionModalOpen(false)}
      />
    </>
  )
}
