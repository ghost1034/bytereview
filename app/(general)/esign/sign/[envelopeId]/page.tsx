'use client'

import { useParams } from 'next/navigation'

import { EsignAccountGate } from '@/components/esign/EsignAccountGate'

export default function EsignSigningEntryPage() {
  const params = useParams<{ envelopeId: string }>()
  const envelopeId = params.envelopeId

  return (
    <EsignAccountGate
      redirectTo={`/dashboard/esign/sign/${encodeURIComponent(envelopeId)}`}
    />
  )
}
