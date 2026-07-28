'use client'

import { Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

import { EsignAccountGate } from '@/components/esign/EsignAccountGate'

function EsignSigningEntryContent() {
  const params = useParams<{ envelopeId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const envelopeId = params.envelopeId
  const guestToken = searchParams.get('guest_token')
  const continueAsGuest = guestToken
    ? () => router.push(`/esign/guest?token=${encodeURIComponent(guestToken)}&continue=guest`)
    : undefined

  return (
    <EsignAccountGate
      redirectTo={`/dashboard/esign/sign/${encodeURIComponent(envelopeId)}`}
      onContinueAsGuest={continueAsGuest}
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
