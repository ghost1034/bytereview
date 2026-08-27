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

import {
  isPaidTasklyticPlan,
  TasklyticPaidAccessGate,
} from './TasklyticPaidAccessGate'

describe('TasklyticPaidAccessGate', () => {
  beforeEach(() => {
    hookState.result = {
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }
  })

  it('recognizes every non-free subscription plan as paid', () => {
    expect(isPaidTasklyticPlan('free')).toBe(false)
    expect(isPaidTasklyticPlan(undefined)).toBe(false)
    expect(isPaidTasklyticPlan('   ')).toBe(false)
    expect(isPaidTasklyticPlan('basic')).toBe(true)
    expect(isPaidTasklyticPlan('PRO')).toBe(true)
  })

  it('does not boot Tasklytic for a free account', () => {
    hookState.result = {
      ...hookState.result,
      data: { plan_code: 'free' },
    }

    const markup = renderToStaticMarkup(
      <TasklyticPaidAccessGate>
        <div>Tasklytic workspace</div>
      </TasklyticPaidAccessGate>,
    )

    expect(markup).toContain('Upgrade to use Tasklytic')
    expect(markup).toContain('View paid plans')
    expect(markup).not.toContain('Tasklytic workspace')
  })

  it('renders Tasklytic for a paid account', () => {
    hookState.result = {
      ...hookState.result,
      data: { plan_code: 'basic' },
    }

    const markup = renderToStaticMarkup(
      <TasklyticPaidAccessGate>
        <div>Tasklytic workspace</div>
      </TasklyticPaidAccessGate>,
    )

    expect(markup).toContain('Tasklytic workspace')
    expect(markup).not.toContain('Upgrade to use Tasklytic')
  })
})
