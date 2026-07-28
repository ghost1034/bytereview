'use client'

import * as React from 'react'
import { FileSignature, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'

import AuthModal from '@/components/auth/AuthModal'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { buildMfaEnrollmentRedirect } from '@/lib/auth-redirect'

interface EsignAccountGateProps {
  redirectTo: string
}

export function EsignAccountGate({ redirectTo }: EsignAccountGateProps) {
  const { loading, requiresMfaEnrollment, user } = useAuth()
  const router = useRouter()
  const [authOpen, setAuthOpen] = React.useState(true)
  const [defaultTab, setDefaultTab] = React.useState<'signin' | 'signup'>('signup')

  React.useEffect(() => {
    if (loading || !user) return
    router.replace(
      requiresMfaEnrollment
        ? buildMfaEnrollmentRedirect(redirectTo)
        : redirectTo,
    )
  }, [loading, redirectTo, requiresMfaEnrollment, router, user])

  if (loading || user) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 size-8 animate-spin text-primary" />
          <p className="text-sm text-foreground-muted">
            {user ? 'Opening your envelope…' : 'Checking your account…'}
          </p>
        </div>
      </div>
    )
  }

  const openAuth = (tab: 'signin' | 'signup') => {
    setDefaultTab(tab)
    setAuthOpen(true)
  }

  return (
    <>
      <section className="relative isolate overflow-hidden bg-surface-muted px-4 py-16 sm:py-24">
        <div className="absolute inset-x-0 top-0 -z-10 h-48 bg-gradient-to-b from-primary/10 to-transparent" />
        <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-surface p-7 text-center shadow-sm sm:p-10">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FileSignature className="size-7" />
          </div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Secure document signing
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Create a free account to sign
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-foreground-muted">
            Sign up for a free CPAAutomation account to review and sign this document. Already have an account? Sign in and we’ll take you directly to the envelope.
          </p>

          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="lg" onClick={() => openAuth('signup')}>
              Create free account
            </Button>
            <Button size="lg" variant="outline" onClick={() => openAuth('signin')}>
              Sign in
            </Button>
          </div>

          <div className="mt-8 grid gap-3 text-left text-sm text-foreground-muted sm:grid-cols-2">
            <div className="flex gap-3 rounded-lg bg-surface-muted p-3">
              <LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>Your account confirms who is accessing the envelope.</span>
            </div>
            <div className="flex gap-3 rounded-lg bg-surface-muted p-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>Your signing activity remains protected and auditable.</span>
            </div>
          </div>
        </div>
      </section>

      <AuthModal
        key={defaultTab}
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        redirectTo={redirectTo}
        defaultTab={defaultTab}
        title="Create a free account to sign"
        description="After signup or signin, you’ll return directly to this envelope."
      />
    </>
  )
}
