import { describe, expect, it } from 'vitest'

import { formatApiErrorMessage, getBillingLimitDetail } from './billingLimit'

describe('billing limit API errors', () => {
  it('formats a structured token 402 as an upgrade prompt', () => {
    const body = {
      detail: {
        code: 'billing_limit_exceeded',
        unit: 'token',
        used: 200_100,
        included: 200_000,
        remaining: 0,
        plan_code: 'free',
      },
    }

    expect(getBillingLimitDetail(body)).toEqual(body.detail)
    expect(formatApiErrorMessage(402, body, 'HTTP 402')).toBe(
      'Token allowance exhausted. Upgrade your plan to continue.',
    )
  })

  it('preserves ordinary string API details', () => {
    expect(formatApiErrorMessage(400, { detail: 'Invalid request' }, 'HTTP 400')).toBe(
      'Invalid request',
    )
  })
})
