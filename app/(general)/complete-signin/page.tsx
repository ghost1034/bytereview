'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import PhoneVerificationForm from '@/components/auth/PhoneVerificationForm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { normalizeAuthRedirectPath } from '@/lib/auth-redirect'

function CompleteSigninContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { clearPendingMfaChallenge, loading, pendingMfaChallenge, user } = useAuth()

  const redirectTo = normalizeAuthRedirectPath(searchParams.get('redirectTo'))

  useEffect(() => {
    if (loading) {
      return
    }

    if (user && !pendingMfaChallenge) {
      router.replace(redirectTo)
      return
    }

    if (!user && !pendingMfaChallenge) {
      router.replace('/')
    }
  }, [loading, pendingMfaChallenge, redirectTo, router, user])

  useEffect(() => {
    return () => {
      clearPendingMfaChallenge()
    }
  }, [clearPendingMfaChallenge])

  if (loading || (user && !pendingMfaChallenge)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
        <p className="text-sm text-foreground-muted">Preparing your sign-in…</p>
      </div>
    )
  }

  if (!pendingMfaChallenge) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
        <Card className="w-full max-w-lg border-border shadow-sm">
          <CardHeader className="space-y-2 text-center">
            <CardTitle className="text-2xl">Sign in again</CardTitle>
            <CardDescription>
              This verification step expired. Return to the sign-in page to request a new code.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <Card className="w-full max-w-lg border-border shadow-sm">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-2xl">Enter your sign-in code</CardTitle>
          <CardDescription>
            For your security, CPAAutomation now requires a 6-digit verification code every time you sign in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PhoneVerificationForm mode="signin" redirectTo={redirectTo} autoSendOnMount />
        </CardContent>
      </Card>
    </div>
  )
}

function CompleteSigninFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <p className="text-sm text-foreground-muted">Preparing your sign-in…</p>
    </div>
  )
}

export default function CompleteSigninPage() {
  return (
    <Suspense fallback={<CompleteSigninFallback />}>
      <CompleteSigninContent />
    </Suspense>
  )
}
