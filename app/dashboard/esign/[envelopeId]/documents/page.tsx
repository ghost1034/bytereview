'use client'

import * as React from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

export default function LegacyDocumentsRedirect() {
  const { envelopeId } = useParams<{ envelopeId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  React.useEffect(() => {
    const query = searchParams.toString()
    router.replace(`/dashboard/esign/${envelopeId}/prepare${query ? `?${query}` : ''}`)
  }, [envelopeId, router, searchParams])
  return <p className="p-6 text-sm text-foreground-muted">Opening envelope preparation…</p>
}
