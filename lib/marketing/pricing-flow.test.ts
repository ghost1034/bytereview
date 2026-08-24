import { describe, expect, it } from 'vitest'
import { canceledCheckoutMessage, checkoutErrorMessage, resolvePricingAction } from './pricing-flow'

const state = { planCode: 'basic', isFree: false, hasDisplayedPrice: true, authLoading: false, signedIn: false, requiresMfaEnrollment: false }

describe('pricing authentication and checkout flow', () => {
  it('authenticates a signed-out paid-plan selection with a resumable path', () => {
    expect(resolvePricingAction(state)).toEqual({ kind: 'authenticate', redirectTo: '/pricing?plan=basic' })
  })

  it('routes a signed-in Free user to the dashboard', () => {
    expect(resolvePricingAction({ ...state, planCode: 'free', isFree: true, signedIn: true })).toEqual({ kind: 'navigate', destination: '/dashboard' })
  })

  it('preserves a paid plan through MFA enrollment', () => {
    expect(resolvePricingAction({ ...state, signedIn: true, requiresMfaEnrollment: true })).toEqual({ kind: 'navigate', destination: '/complete-signup?redirectTo=%2Fpricing%3Fplan%3Dbasic' })
  })

  it('continues a resumed signed-in paid plan to checkout', () => {
    expect(resolvePricingAction({ ...state, signedIn: true })).toEqual({ kind: 'checkout', planCode: 'basic' })
  })

  it('does not invent a purchasable action for an unknown plan', () => {
    expect(resolvePricingAction({ ...state, planCode: 'custom', hasDisplayedPrice: false })).toEqual({ kind: 'unavailable' })
  })

  it('retains cancellation and checkout error feedback', () => {
    expect(canceledCheckoutMessage).toBe('Checkout canceled. Your plan has not changed.')
    expect(checkoutErrorMessage(new Error('Card unavailable'))).toBe('Card unavailable')
    expect(checkoutErrorMessage(null)).toBe('Failed to create checkout session')
  })
})
