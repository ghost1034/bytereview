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
  const { user, loading, requiresPhoneVerification } = useAuth()

  const redirectTo = normalizeAuthRedirectPath(searchParams.get('redirectTo'))

  useEffect(() => {
    if (loading) {
      return
    }

    if (!user) {
      router.replace('/')
      return
    }

    if (!requiresPhoneVerification) {
      router.replace(redirectTo)
    }
  }, [loading, redirectTo, requiresPhoneVerification, router, user])

  if (loading || !user || !requiresPhoneVerification) {
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
          <CardTitle className="text-2xl">Complete your signup</CardTitle>
          <CardDescription>
            Add and verify your phone number to finish setting up your CPAAutomation account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PhoneVerificationForm redirectTo={redirectTo} />
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
