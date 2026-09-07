import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const hookState = vi.hoisted(() => ({
  result: {} as Record<string, unknown>,
}))

vi.mock('@/hooks/useBilling', () => ({
  useBillingAccount: () => hookState.result,
}))

vi.mock('@/components/subscription/SubscriptionModal', () => ({
  default: ({ planCodes }: { planCodes?: string[] }) => (
    <div data-plan-codes={planCodes?.join(',')} />
  ),
}))

import { FirmCrmProAccessGate, isFirmCrmProPlan } from './FirmCrmProAccessGate'

describe('FirmCrmProAccessGate', () => {
  beforeEach(() => {
    hookState.result = {
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }
  })

  it('recognizes only the Pro plan', () => {
    expect(isFirmCrmProPlan('pro')).toBe(true)
    expect(isFirmCrmProPlan(' PRO ')).toBe(true)
    expect(isFirmCrmProPlan('basic')).toBe(false)
    expect(isFirmCrmProPlan('free')).toBe(false)
    expect(isFirmCrmProPlan(undefined)).toBe(false)
  })

  it.each(['free', 'basic'])('blocks the %s plan without mounting FirmCRM', (planCode) => {
    hookState.result = { ...hookState.result, data: { plan_code: planCode } }
    const markup = renderToStaticMarkup(
      <FirmCrmProAccessGate><div>FirmCRM workspace</div></FirmCrmProAccessGate>,
    )

    expect(markup).toContain('Upgrade to use FirmCRM')
    expect(markup).toContain('View Pro plan')
    expect(markup).toContain('data-plan-codes="pro"')
    expect(markup).not.toContain('FirmCRM workspace')
  })

  it('mounts FirmCRM for Pro users', () => {
    hookState.result = { ...hookState.result, data: { plan_code: 'pro' } }
    const markup = renderToStaticMarkup(
      <FirmCrmProAccessGate><div>FirmCRM workspace</div></FirmCrmProAccessGate>,
    )

    expect(markup).toContain('FirmCRM workspace')
    expect(markup).not.toContain('Upgrade to use FirmCRM')
  })
})
