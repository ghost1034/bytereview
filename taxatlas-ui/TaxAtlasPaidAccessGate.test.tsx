import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const hookState = vi.hoisted(() => ({
  result: {} as Record<string, unknown>,
}))

vi.mock('@/hooks/useBilling', () => ({
  useBillingAccount: () => hookState.result,
}))

vi.mock('@/components/subscription/SubscriptionModal', () => ({
  default: () => <div data-testid="subscription-modal" />,
}))

import { TaxAtlasPaidAccessGate } from './TaxAtlasPaidAccessGate'

describe('TaxAtlasPaidAccessGate', () => {
  beforeEach(() => {
    hookState.result = {
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }
  })

  it('blocks free plans without mounting TaxAtlas', () => {
    hookState.result = { ...hookState.result, data: { plan_code: 'free' } }
    const markup = renderToStaticMarkup(
      <TaxAtlasPaidAccessGate><div>TaxAtlas map</div></TaxAtlasPaidAccessGate>,
    )
    expect(markup).toContain('Upgrade to use TaxAtlas')
    expect(markup).not.toContain('TaxAtlas map')
  })

  it('fails closed with a retry screen when billing cannot be loaded', () => {
    hookState.result = { ...hookState.result, error: new Error('billing unavailable') }
    const markup = renderToStaticMarkup(
      <TaxAtlasPaidAccessGate><div>TaxAtlas map</div></TaxAtlasPaidAccessGate>,
    )
    expect(markup).toContain('We could not verify your plan')
    expect(markup).toContain('Check again')
    expect(markup).not.toContain('TaxAtlas map')
  })

  it('mounts TaxAtlas for every non-free plan', () => {
    hookState.result = { ...hookState.result, data: { plan_code: 'pro' } }
    const markup = renderToStaticMarkup(
      <TaxAtlasPaidAccessGate><div>TaxAtlas map</div></TaxAtlasPaidAccessGate>,
    )
    expect(markup).toContain('TaxAtlas map')
  })
})
