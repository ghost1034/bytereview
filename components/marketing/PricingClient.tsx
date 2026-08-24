'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import AuthModal from '@/components/auth/AuthModal'
import { useAuth } from '@/contexts/AuthContext'
import { useCreateCheckoutSession, useSubscriptionPlans, type SubscriptionPlan } from '@/hooks/useBilling'
import { formatAutomationLimit, formatCurrencyFromCents, formatLimit, presentPlan } from '@/lib/marketing/config'
import { canceledCheckoutMessage, resolvePricingAction } from '@/lib/marketing/pricing-flow'

const planOrder: Record<string, number> = { free: 0, basic: 1, pro: 2 }

export function planFeatures(plan: SubscriptionPlan) {
  const code = plan.code.toLowerCase()
  const fixed = code === 'free' ? ['Community support', 'Standard processing speed'] : code === 'basic' ? ['Email support', 'Standard processing speed'] : code === 'pro' ? ['Priority support', 'Fast processing speed', 'API access', 'Advanced integrations'] : []
  return [
    formatLimit(plan.pages_included, 'page'),
    `${plan.tokens_included.toLocaleString('en-US')} platform AI tokens per month`,
    formatAutomationLimit(plan.automations_limit),
    'Custom extraction templates',
    'Export to CSV, Excel, Google Sheets',
    ...fixed,
  ]
}

export function planOverage(plan: SubscriptionPlan) {
  if (!plan.overage_cents && !plan.token_overage_cents) return 'No overage allowed'
  return `Overage: ${formatCurrencyFromCents(plan.overage_cents)}/page + ${formatCurrencyFromCents(plan.token_overage_cents)}/1,000 tokens`
}

export function PricingClient() {
  const { data, isLoading, isError } = useSubscriptionPlans()
  const { loading: authLoading, requiresMfaEnrollment, user } = useAuth()
  const checkout = useCreateCheckoutSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [authOpen, setAuthOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const resumed = useRef(false)
  const planParam = searchParams.get('plan')
  const canceled = searchParams.get('upgrade') === 'canceled'

  const startCheckout = (code: string) => {
    setSelectedPlan(code)
    const action = resolvePricingAction({ planCode: code, isFree: false, hasDisplayedPrice: true, authLoading, signedIn: !!user, requiresMfaEnrollment })
    if (action.kind === 'authenticate') {
      setAuthOpen(true)
      return
    }
    if (action.kind === 'navigate') {
      router.push(action.destination)
      return
    }
    checkout.mutate({
      plan_code: code,
      success_url: `${window.location.origin}/dashboard/settings?upgrade=success`,
      cancel_url: `${window.location.origin}/pricing?upgrade=canceled`,
    })
  }

  useEffect(() => {
    if (!planParam || !user || authLoading || requiresMfaEnrollment || resumed.current) return
    if (!data?.some((plan) => plan.code === planParam && plan.code.toLowerCase() !== 'free')) return
    resumed.current = true
    startCheckout(planParam)
    // startCheckout intentionally depends on the current auth/query snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planParam, user, authLoading, requiresMfaEnrollment, data])

  if (isLoading) return <div className="ps-state-box" role="status">Loading plans…</div>
  if (isError || !data) return <div className="ps-state-box" role="alert"><h2>We couldn&apos;t load plans</h2><p>Please try again shortly.</p></div>

  const plans = [...data].sort((a, b) => (planOrder[a.code.toLowerCase()] ?? a.sort_order + 10) - (planOrder[b.code.toLowerCase()] ?? b.sort_order + 10))
  return <>
    {canceled && <p className="ps-form-status" role="status">{canceledCheckoutMessage}</p>}
    <div className="ps-pricing-grid">{plans.map((plan) => {
      const display = presentPlan(plan)
      const code = plan.code.toLowerCase()
      const popular = code === 'pro'
      const busy = checkout.isPending && selectedPlan === plan.code
      return <article className={popular ? 'ps-plan ps-plan--popular' : 'ps-plan'} key={plan.code}>
        {popular && <span className="ps-plan__badge">Most popular</span>}
        <h2>{display.name}</h2><p className="ps-plan__description">{display.description}</p><p className="ps-plan__price">{display.price ?? '—'}</p>
        <ul>{planFeatures(plan).map(feature => <li key={feature}>{feature}</li>)}</ul><small>{planOverage(plan)}</small>
        {code === 'free' ? <button className="ps-button ps-button--outline" type="button" disabled={authLoading} onClick={() => { const action = resolvePricingAction({ planCode: plan.code, isFree: true, hasDisplayedPrice: true, authLoading, signedIn: !!user, requiresMfaEnrollment }); if (action.kind === 'authenticate') setAuthOpen(true); if (action.kind === 'navigate') router.push(action.destination) }}>{authLoading ? 'Loading…' : 'Get started free'}</button> : display.price ? <button className="ps-button" type="button" disabled={busy || authLoading} onClick={() => startCheckout(plan.code)}>{busy ? 'Loading…' : 'Get started'}</button> : null}
      </article>
    })}</div>
    <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} redirectTo={selectedPlan ? `/pricing?plan=${encodeURIComponent(selectedPlan)}` : '/dashboard'} defaultTab="signup" />
  </>
}
