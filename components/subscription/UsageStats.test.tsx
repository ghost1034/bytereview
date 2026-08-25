import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const hookState = vi.hoisted(() => ({
  result: {} as Record<string, unknown>,
}))

vi.mock('@/hooks/useBilling', () => ({
  useUsageStats: () => hookState.result,
}))

import UsageStats from './UsageStats'

const usage = {
  pages_used: 600,
  pages_included: 500,
  pages_remaining: 0,
  tokens_used: 1_020_000,
  tokens_included: 1_000_000,
  tokens_remaining: 0,
  period_start: '2026-08-01T00:00:00Z',
  period_end: '2026-08-31T23:59:59Z',
  plan_code: 'basic',
  plan_display_name: 'Basic',
  overage_cents: 15,
  token_overage_cents: 25,
  token_billing_shadow: false,
  product_breakdown: {
    form_fill: { pages: 100, tokens: 0 },
    inkwise: { pages: 0, tokens: 1_500 },
  },
}

describe('UsageStats', () => {
  beforeEach(() => {
    hookState.result = { data: usage, isLoading: false, error: null }
  })

  it('shows independent page and platform-token quotas with module usage', () => {
    const markup = renderToStaticMarkup(<UsageStats />)

    expect(markup).toContain('Pages')
    expect(markup).toContain('Platform AI tokens')
    expect(markup).toContain('$0.15')
    expect(markup).toContain('Estimated token overage: $0.50')
    expect(markup).toContain('form fill')
    expect(markup).toContain('1,500 tokens')
    expect(markup.toLowerCase()).not.toContain('automation')
  })

  it('explains shadow tracking and suppresses token overage charges', () => {
    hookState.result = {
      data: {
        ...usage,
        token_billing_shadow: true,
        token_billing_effective_at: '2026-09-01T00:00:00Z',
      },
      isLoading: false,
      error: null,
    }

    const markup = renderToStaticMarkup(<UsageStats />)
    expect(markup).toContain('Shadow tracking until')
    expect(markup).not.toContain('Estimated token overage')
  })
})
