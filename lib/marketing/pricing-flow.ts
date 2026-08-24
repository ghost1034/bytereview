import { buildMfaEnrollmentRedirect } from '@/lib/auth-redirect'

export type PricingAction =
  | { kind: 'loading' }
  | { kind: 'authenticate'; redirectTo: string }
  | { kind: 'navigate'; destination: string }
  | { kind: 'checkout'; planCode: string }
  | { kind: 'unavailable' }

export function resolvePricingAction({ planCode, isFree, hasDisplayedPrice, authLoading, signedIn, requiresMfaEnrollment }: {
  planCode: string
  isFree: boolean
  hasDisplayedPrice: boolean
  authLoading: boolean
  signedIn: boolean
  requiresMfaEnrollment: boolean
}): PricingAction {
  if (authLoading) return { kind: 'loading' }
  const destination = isFree ? '/dashboard' : `/pricing?plan=${encodeURIComponent(planCode)}`
  if (!isFree && !hasDisplayedPrice) return { kind: 'unavailable' }
  if (!signedIn) return { kind: 'authenticate', redirectTo: destination }
  if (requiresMfaEnrollment) return { kind: 'navigate', destination: buildMfaEnrollmentRedirect(destination) }
  return isFree ? { kind: 'navigate', destination } : { kind: 'checkout', planCode }
}

export const canceledCheckoutMessage = 'Checkout canceled. Your plan has not changed.'

export function checkoutErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'Failed to create checkout session'
}
