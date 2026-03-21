'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import PhoneVerificationForm from '@/components/auth/PhoneVerificationForm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { normalizeAuthRedirectPath } from '@/lib/auth-redirect'

function CompleteSignupContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { pendingEnrollmentPhoneNumber, user, loading, requiresMfaEnrollment } = useAuth()

  const redirectTo = normalizeAuthRedirectPath(searchParams.get('redirectTo'))

  useEffect(() => {
    if (loading) {
      return
    }

    if (!user) {
      router.replace('/')
      return
    }

    if (!requiresMfaEnrollment) {
      router.replace(redirectTo)
    }
  }, [loading, redirectTo, requiresMfaEnrollment, router, user])

  if (loading || !user || !requiresMfaEnrollment) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
        <p className="text-sm text-gray-600">Preparing your account...</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <Card className="w-full max-w-lg border-gray-200 shadow-sm">
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
          />
        </CardContent>
      </Card>
    </div>
  )
}

function CompleteSignupFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <p className="text-sm text-gray-600">Preparing your account...</p>
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
