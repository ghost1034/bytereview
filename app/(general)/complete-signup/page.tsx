'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'

import PhoneVerificationForm from '@/components/auth/PhoneVerificationForm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { normalizeAuthRedirectPath } from '@/lib/auth-redirect'
import { isPhoneMfaExemptEmail } from '@/lib/phone-mfa-exempt'

function CompleteSignupContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { pendingEnrollmentPhoneNumber, user, loading, requiresMfaEnrollment } = useAuth()

  const redirectTo = normalizeAuthRedirectPath(searchParams.get('redirectTo'))
  const isPhoneMfaExempt = isPhoneMfaExemptEmail(user?.email)

  useEffect(() => {
    if (loading) {
      return
    }

    if (!user) {
      router.replace('/')
      return
    }

    if (isPhoneMfaExempt) {
      router.replace(redirectTo)
      return
    }

    if (!requiresMfaEnrollment) {
      router.replace(redirectTo)
    }
  }, [isPhoneMfaExempt, loading, redirectTo, requiresMfaEnrollment, router, user])

  if (loading || !user || isPhoneMfaExempt || !requiresMfaEnrollment) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
        <p className="text-sm text-foreground-muted">Preparing your account…</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <Card className="w-full max-w-lg border-border shadow-sm">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-2xl">Secure your sign-in</CardTitle>
          <CardDescription>
            Verify your email if needed, then add the phone number that should receive a sign-in code every time you log in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PhoneVerificationForm
            mode="enroll"
            initialPhoneNumber={pendingEnrollmentPhoneNumber ?? user.phoneNumber ?? ''}
            redirectTo={redirectTo}
            onVerified={() => {
              // Re-sync the backend profile so the freshly enrolled MFA phone is recorded
              queryClient.invalidateQueries({ queryKey: ['user-profile'] })
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function CompleteSignupFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <p className="text-sm text-foreground-muted">Preparing your account…</p>
    </div>
  )
}

export default function CompleteSignupPage() {
  return (
    <Suspense fallback={<CompleteSignupFallback />}>
      <CompleteSignupContent />
    </Suspense>
  )
}
