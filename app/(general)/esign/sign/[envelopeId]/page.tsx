'use client'

import { Suspense, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

import { EsignAccountGate } from '@/components/esign/EsignAccountGate'

function EsignSigningEntryContent() {
  const params = useParams<{ envelopeId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const envelopeId = params.envelopeId
  const guestToken = searchParams.get('guest_token')
  // An email-link invitation identifies its recipient independently of the
  // account currently signed in. Preserve it for signing AND completed copies.
  useEffect(() => {
    if (guestToken) {
      router.replace(`/esign/guest?token=${encodeURIComponent(guestToken)}&continue=guest`)
    }
  }, [guestToken, router])

  if (guestToken) {
    return <p className="p-8 text-center text-sm text-foreground-muted">Opening your secure envelope…</p>
  }

  return (
    <EsignAccountGate
      redirectTo={`/dashboard/esign/sign/${encodeURIComponent(envelopeId)}`}
    />
  )
}

export default function EsignSigningEntryPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-sm text-foreground-muted">Opening secure signing page…</p>}>
      <EsignSigningEntryContent />
    </Suspense>
  )
}
