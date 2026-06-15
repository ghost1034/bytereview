'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { HelpCircle, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FaqAccordion } from '@/components/marketing/faq-accordion'
import { MarketingHero } from '@/components/marketing/marketing-hero'
import { PricingTier } from '@/components/marketing/pricing-tier'
import { SectionShell } from '@/components/pages/home/shared/SectionShell'
import { accent } from '@/components/pages/home/shared/tones'
import {
  staggerChild,
  staggerContainer,
  viewportOnce,
} from '@/lib/animations'
import { useAuth } from '@/contexts/AuthContext'
import AuthModal from '@/components/auth/AuthModal'
import {
  useCreateCheckoutSession,
  useSubscriptionPlans,
} from '@/hooks/useBilling'
import { buildMfaEnrollmentRedirect } from '@/lib/auth-redirect'

const PLAN_DESCRIPTIONS: Record<string, string> = {
  free: 'Get started for free',
  basic: 'For individuals and small teams',
  pro: 'For growing finance teams',
}

const FAQS = [
  {
    q: 'Can I cancel my subscription at any time?',
    a: 'Yes, you can cancel your subscription at any time. There are no long-term contracts or cancellation fees.',
  },
  {
    q: 'How does overage pricing work?',
    a: 'Paid plans include a monthly page allotment. If a plan includes overage, additional pages are billed at the overage rate shown on the plan card. Free plans do not allow overage. You’ll see your usage in the dashboard so you can track and manage spending.',
  },
  {
    q: 'Do you offer annual billing or discounts?',
    a: 'Yes. We can provide annual billing and volume discounts for teams with higher usage. Contact us if you’re interested in annual pricing or custom plans.',
  },
  {
    q: 'What happens if I upgrade or downgrade?',
    a: 'Plan changes take effect immediately. If you upgrade, you get access to the higher plan’s limits right away. If you downgrade, new limits apply immediately and your next bill will reflect the new plan.',
  },
]

export default function Pricing() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [pendingPlan, setPendingPlan] = useState<string>('')
  const { user, requiresMfaEnrollment } = useAuth()
  const { data: plans, isLoading } = useSubscriptionPlans()
  const createCheckoutSession = useCreateCheckoutSession()
  const router = useRouter()

  useEffect(() => {
    if (user && !requiresMfaEnrollment && typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const planParam = urlParams.get('plan')
      const checkoutParam = urlParams.get('checkout')

      if (planParam && checkoutParam === 'true') {
        window.history.replaceState({}, '', '/pricing')
        createCheckoutSession.mutate({
          plan_code: planParam,
          success_url: `${window.location.origin}/dashboard?success=true`,
          cancel_url: `${window.location.origin}/pricing`,
        })
      }
    }
  }, [createCheckoutSession, requiresMfaEnrollment, user])

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
    automationsLimit: number,
  ) => {
    const baseFeatures = [
      `${pagesIncluded === 999999 ? 'Unlimited' : pagesIncluded.toLocaleString()} ${pagesIncluded === 1 ? 'page' : 'pages'} per month`,
      `Up to ${automationsLimit} ${automationsLimit === 1 ? 'automation' : 'automations'}`,
      'Custom extraction templates',
      'Export to CSV, Excel, Google Sheets',
    ]
    if (planCode === 'free') {
      return [...baseFeatures, 'Community support', 'Standard processing speed']
    }
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

  const handleGetStarted = (planCode: string) => {
    if (!user) {
      const redirectUrl =
        planCode === 'free'
          ? '/dashboard'
          : `/pricing?plan=${planCode}&checkout=true`
      setPendingPlan(redirectUrl)
      setIsAuthModalOpen(true)
    } else if (requiresMfaEnrollment) {
      const redirectUrl =
        planCode === 'free'
          ? '/dashboard'
          : `/pricing?plan=${planCode}&checkout=true`
      router.push(buildMfaEnrollmentRedirect(redirectUrl))
    } else {
      if (planCode === 'free') {
        window.location.href = '/dashboard'
      } else {
        createCheckoutSession.mutate({
          plan_code: planCode,
          success_url: `${window.location.origin}/dashboard?success=true`,
          cancel_url: `${window.location.origin}/pricing`,
        })
      }
    }
  }

  const sortedPlans = [...(plans || [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  )

  return (
    <div className="dark marketing-dark min-h-screen bg-background text-foreground">
      <MarketingHero
        backdrop="gradient"
        width="narrow"
        eyebrow="Pricing"
        title={
          <>
            Pricing for teams of{' '}
            <span
              className={cn(
                'bg-gradient-to-r bg-clip-text text-transparent',
                accent('blue').gradient,
              )}
            >
              every size
            </span>
          </>
        }
        description="All plans are available month-to-month and you can cancel at any time."
      />

      <section className="bg-background pb-16 pt-8 sm:pb-20 sm:pt-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-foreground-muted">
              <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
              Loading plans…
            </div>
          ) : (
            <motion.div
              className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3"
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={viewportOnce}
            >
              {sortedPlans.map((plan) => (
                <motion.div key={plan.code} variants={staggerChild}>
                <PricingTier
                  name={plan.display_name}
                  description={
                    PLAN_DESCRIPTIONS[plan.code] ?? 'Flexible plan'
                  }
                  price={getPlanPrice(plan.code)}
                  period={plan.code === 'free' ? '' : '/month'}
                  fineprint={
                    plan.overage_cents > 0
                      ? `Overage: ${(plan.overage_cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} per page`
                      : 'No overage allowed'
                  }
                  features={getPlanFeatures(
                    plan.code,
                    plan.pages_included,
                    plan.automations_limit,
                  )}
                  highlighted={plan.code === 'pro'}
                  className={plan.code === 'pro' ? 'shadow-glow' : undefined}
                  badge={plan.code === 'pro' ? 'Most popular' : undefined}
                  cta={
                    <Button
                      className="w-full"
                      variant={plan.code === 'pro' ? 'default' : 'outline'}
                      onClick={() => handleGetStarted(plan.code)}
                      disabled={createCheckoutSession.isPending}
                    >
                      {createCheckoutSession.isPending ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                          Loading…
                        </>
                      ) : plan.code === 'free' ? (
                        'Get started free'
                      ) : (
                        'Get started'
                      )}
                    </Button>
                  }
                />
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </section>

      <SectionShell
        surface="surface-muted"
        width="narrow"
        eyebrow="FAQ"
        eyebrowIcon={HelpCircle}
        eyebrowTone="blue"
        title="Frequently asked questions"
      >
        <FaqAccordion items={FAQS} />
      </SectionShell>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        redirectTo={pendingPlan}
      />
    </div>
  )
}
