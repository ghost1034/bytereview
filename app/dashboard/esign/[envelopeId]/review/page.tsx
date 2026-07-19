'use client'

import * as React from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

export default function LegacyReviewRedirect() {
  const { envelopeId } = useParams<{ envelopeId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  React.useEffect(() => {
    const next = new URLSearchParams(searchParams.toString())
    next.set('review', 'open')
    router.replace(`/dashboard/esign/${envelopeId}/fields?${next.toString()}`)
  }, [envelopeId, router, searchParams])
  return <p className="p-6 text-sm text-foreground-muted">Opening review…</p>
}
