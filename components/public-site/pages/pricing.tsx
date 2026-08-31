'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check, Loader2, Sparkles } from 'lucide-react'

import AuthModal from '@/components/auth/AuthModal'
import { useAuth } from '@/contexts/AuthContext'
import { useCreateCheckoutSession, useSubscriptionPlans } from '@/hooks/useBilling'
import { buildMfaEnrollmentRedirect } from '@/lib/auth-redirect'
import { getPublicPlanFeatures, getPublicPlanPrice, getPublicPricingState } from '../model'
import { PageHero, Reveal, SectionHeading } from '../ui'

const DESCRIPTIONS: Record<string, string> = {
  free: 'Explore the platform and start a lighter workflow.',
  basic: 'For individuals and small teams automating regular work.',
  pro: 'For professional teams with higher volume and integrations.',
}

const FAQS = [
  ['Can I cancel at any time?', 'Yes. Plans are month-to-month with no cancellation fee.'],
  ['How do overages work?', 'Pages and platform AI tokens have separate allowances. Paid-plan overages use the rates shown on each plan.'],
  ['Do you offer annual pricing?', 'Yes. Contact us for annual billing, higher-volume plans, and enterprise requirements.'],
  ['What happens when I change plans?', 'Upgrades take effect immediately. New limits and billing apply according to the selected plan.'],
]

export default function PublicPricing() {
  const [authOpen, setAuthOpen] = useState(false)
  const [pendingRedirect, setPendingRedirect] = useState('/dashboard')
  const { user, requiresMfaEnrollment } = useAuth()
  const { data: plans, isLoading, isError } = useSubscriptionPlans()
  const checkout = useCreateCheckoutSession()
  const router = useRouter()

  useEffect(() => {
    if (!user || requiresMfaEnrollment || typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const planCode = params.get('plan')
    if (planCode && params.get('checkout') === 'true') {
      window.history.replaceState({}, '', '/pricing')
      checkout.mutate({
        plan_code: planCode,
        success_url: `${window.location.origin}/dashboard?success=true`,
        cancel_url: `${window.location.origin}/pricing`,
      })
    }
  }, [checkout, requiresMfaEnrollment, user])

  const start = (planCode: string) => {
    const redirect = planCode === 'free' ? '/dashboard' : `/pricing?plan=${planCode}&checkout=true`
    if (!user) {
      setPendingRedirect(redirect)
      setAuthOpen(true)
      return
    }
    if (requiresMfaEnrollment) {
      router.push(buildMfaEnrollmentRedirect(redirect))
      return
    }
    if (planCode === 'free') {
      router.push('/dashboard')
      return
    }
    checkout.mutate({
      plan_code: planCode,
      success_url: `${window.location.origin}/dashboard?success=true`,
      cancel_url: `${window.location.origin}/pricing`,
    })
  }

  const sortedPlans = [...(plans ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  const pricingState = getPublicPricingState({ isLoading, isError, planCount: sortedPlans.length })

  return (
    <>
      <PageHero eyebrow="Simple, transparent pricing" title={<>Start free. Scale when <span className="ps-gradient-text">the work scales.</span></>} description="Every plan connects to the same professional AI platform. Choose the capacity and support level that fits your team." />
      <section className="ps-section ps-section--soft">
        <div className="ps-container">
          {pricingState === 'loading' && <div className="ps-pricing-state"><Loader2 className="animate-spin" />Loading live plans…</div>}
          {pricingState === 'error' && <div className="ps-pricing-state ps-pricing-state--error"><AlertCircle />Plans could not be loaded. Please refresh or contact us.</div>}
          {pricingState === 'empty' && <div className="ps-pricing-state">No plans are currently available.</div>}
          <div className="ps-pricing-grid">
            {sortedPlans.map((plan, index) => (
              <Reveal key={plan.code} className={plan.code === 'pro' ? 'ps-pricing-card ps-pricing-card--featured' : 'ps-pricing-card'}>
                <div className="ps-pricing-card__top"><span>0{index + 1}</span>{plan.code === 'pro' && <b><Sparkles />Most popular</b>}</div>
                <h2>{plan.display_name}</h2><p>{DESCRIPTIONS[plan.code] ?? 'A flexible plan for your workflow.'}</p>
                <div className="ps-pricing-card__price"><strong>{getPublicPlanPrice(plan.code)}</strong>{plan.code !== 'free' && <span>/ month</span>}</div>
                <ul>{getPublicPlanFeatures(plan).map((feature) => <li key={feature}><Check />{feature}</li>)}</ul>
                {plan.overage_cents > 0 && <small>Overage: ${(plan.overage_cents / 100).toFixed(2)}/page + ${(plan.token_overage_cents / 100).toFixed(2)}/10,000 tokens</small>}
                <button type="button" onClick={() => start(plan.code)} disabled={checkout.isPending}>{checkout.isPending ? <><Loader2 className="animate-spin" />Loading…</> : plan.code === 'free' ? 'Get started free' : 'Choose this plan'}</button>
              </Reveal>
            ))}
          </div>
          {checkout.isError && <div className="ps-pricing-state ps-pricing-state--error"><AlertCircle />Checkout could not be opened. Please try again.</div>}
        </div>
      </section>
      <section className="ps-section">
        <div className="ps-container">
          <SectionHeading number="001" eyebrow="Pricing questions" title="The details teams ask before choosing." />
          <div className="ps-faq-list">{FAQS.map(([question, answer], index) => <details key={question} className="ps-faq-item"><summary><span>0{index + 1}</span><strong>{question}</strong><Sparkles /></summary><p>{answer}</p></details>)}</div>
        </div>
      </section>
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} redirectTo={pendingRedirect} />
    </>
  )
}
