'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Loader2, ShieldAlert } from 'lucide-react'

import {
  SigningCeremony,
  type SigningCeremonyTransport,
} from '@/components/esign/sign/SigningCeremony'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { useSigningSession } from '@/hooks/useEnvelopes'
import { ApiError, apiClient } from '@/lib/api'

export default function SigningCeremonyPage() {
  const params = useParams<{ envelopeId: string }>()
  const envelopeId = params?.envelopeId
  const router = useRouter()
  const { user } = useAuth()
  const sessionQuery = useSigningSession(envelopeId)
  const refetchSession = sessionQuery.refetch

  const transport = React.useMemo<SigningCeremonyTransport>(() => ({
    access: 'authenticated',
    recordConsent: (expectedRoutingVersion) => apiClient.recordEsignConsent(envelopeId!, expectedRoutingVersion),
    saveProgress: ({ fieldValues, expectedRoutingVersion, marks }) =>
      apiClient.saveEsignSigningProgress(envelopeId!, fieldValues, expectedRoutingVersion, marks ?? undefined),
    submit: (payload) => apiClient.submitEsignSignature(envelopeId!, payload),
    decline: (reason, expectedRoutingVersion) =>
      apiClient.declineEsignEnvelope(envelopeId!, reason, expectedRoutingVersion),
    uploadAttachment: (fieldId, file) => apiClient.uploadEsignSignerAttachment(envelopeId!, fieldId, file),
    deleteAttachment: (attachmentId) => apiClient.deleteEsignSignerAttachment(envelopeId!, attachmentId),
    reassign: (payload) => apiClient.reassignEsignRecipient(envelopeId!, payload),
    approve: (expectedRoutingVersion) => apiClient.approveEsignEnvelope(envelopeId!, expectedRoutingVersion),
    completeManagerStep: (expectedRoutingVersion) =>
      apiClient.completeEsignManagerStep(envelopeId!, expectedRoutingVersion),
    updateManagedRecipients: (payload) => apiClient.updateEsignManagedRecipients(envelopeId!, payload),
    configureWitness: (payload) => apiClient.configureEsignWitness(envelopeId!, payload),
    startInPerson: (payload) => apiClient.startEsignInPerson(envelopeId!, payload),
    downloadCompleted: async (kind) => {
      const result = kind === 'sealed'
        ? await apiClient.getEsignSealedDownload(envelopeId!)
        : await apiClient.getEsignCertificateDownload(envelopeId!)
      window.open(result.url, '_blank', 'noopener')
    },
    refresh: async () => {
      const result = await refetchSession()
      if (!result.data) throw new Error('The signing session could not be refreshed')
      return result.data
    },
    afterFinishLater: () => router.push('/dashboard/esign'),
  }), [envelopeId, refetchSession, router])

  if (sessionQuery.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-foreground-muted">
        <Loader2 className="mr-2 size-5 animate-spin" /> Preparing your signing session…
      </div>
    )
  }

  if (sessionQuery.isError) {
    const message = sessionQuery.error instanceof ApiError
      ? sessionQuery.error.message
      : 'This envelope is not available for signing.'
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
        <ShieldAlert className="size-10 text-warning" />
        <h1 className="text-lg font-semibold">Can&apos;t open signing session</h1>
        <p className="text-sm text-foreground-muted">{message}</p>
        <Button asChild variant="outline"><Link href="/dashboard/esign">Go to E-Signature</Link></Button>
      </div>
    )
  }

  if (!sessionQuery.data) return null

  return (
    <SigningCeremony
      initialSession={sessionQuery.data}
      transport={transport}
      displayName={user?.displayName}
      exitHref="/dashboard/esign"
    />
  )
}
