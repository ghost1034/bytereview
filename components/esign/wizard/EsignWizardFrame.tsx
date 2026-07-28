'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EnvelopeStatusBadge } from '@/components/ui/envelope-status-badge'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { StepIndicator, type Step } from '@/components/ui/step-indicator'
import { useEnvelope } from '@/hooks/useEnvelopes'
import type { EsignEnvelopeResponse } from '@/lib/api'
import { cn } from '@/lib/utils'

export const ESIGN_WIZARD_STEPS: Step[] = [
  { id: 'documents', label: 'Documents', description: 'Add PDF or Word files', href: 'documents' },
  { id: 'recipients', label: 'Recipients', description: 'Who signs, in order', href: 'recipients' },
  { id: 'fields', label: 'Fields', description: 'Place signature fields', href: 'fields' },
  { id: 'review', label: 'Review', description: 'Confirm and send', href: 'review' },
]

export type EsignWizardStepId = (typeof ESIGN_WIZARD_STEPS)[number]['id']

/**
 * Loads the envelope for a wizard page and redirects to the detail page when
 * it is no longer an editable draft.
 */
export function useDraftEnvelope(envelopeId: string | undefined) {
  const router = useRouter()
  const envelopeQuery = useEnvelope(envelopeId)
  const envelope = envelopeQuery.data

  React.useEffect(() => {
    if (envelope && envelope.status !== 'draft') {
      router.replace(`/dashboard/esign/${envelope.id}`)
    }
  }, [envelope, router])

  return envelopeQuery
}

interface EsignWizardFrameProps {
  step: EsignWizardStepId
  envelope: EsignEnvelopeResponse | undefined
  /** Footer slot rendered as a sticky action bar below content */
  footer?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function EsignWizardFrame({
  step,
  envelope,
  footer,
  children,
  className,
}: EsignWizardFrameProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentIndex = ESIGN_WIZARD_STEPS.findIndex((s) => s.id === step)
  const safeIndex = currentIndex >= 0 ? currentIndex : 0

  const stepHref = React.useCallback(
    (target: Step) => {
      if (!envelope) return '#'
      const query = searchParams?.toString()
      return `/dashboard/esign/${envelope.id}/${target.href}${query ? `?${query}` : ''}`
    },
    [envelope, searchParams],
  )

  if (!envelope) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  return (
    <div className={cn('space-y-6', className)}>
      <PageHeader
        eyebrow={`E-Signature · Step ${safeIndex + 1} of ${ESIGN_WIZARD_STEPS.length}`}
        title={envelope.title}
        description={
          <span className="inline-flex items-center gap-2">
            <EnvelopeStatusBadge status={envelope.status} />
            {envelope.documents.length} document{envelope.documents.length === 1 ? '' : 's'}
          </span>
        }
        actions={
          <Button variant="ghost" asChild>
            <Link href="/dashboard/esign">
              <ArrowLeft className="mr-1.5 size-4" /> Envelopes
            </Link>
          </Button>
        }
      />

      <StepIndicator
        steps={ESIGN_WIZARD_STEPS}
        currentStep={safeIndex}
        onStepSelect={(_, target) => router.push(stepHref(target))}
      />

      <div>{children}</div>

      {footer && (
        <div
          className={cn(
            'sticky bottom-0 z-10 -mx-4 mt-2 border-t border-border bg-background/85 px-4 py-3 backdrop-blur',
            'sm:-mx-6 sm:px-6',
            'lg:-mx-8 lg:px-8',
          )}
        >
          {footer}
        </div>
      )}
    </div>
  )
}

interface EsignWizardFooterProps {
  back?: React.ReactNode
  primary?: React.ReactNode
  secondary?: React.ReactNode
  className?: string
}

export function EsignWizardFooter({
  back,
  primary,
  secondary,
  className,
}: EsignWizardFooterProps) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex flex-1 items-center gap-2">{back}</div>
      <div className="flex flex-1 items-center justify-end gap-2">
        {secondary}
        {primary}
      </div>
    </div>
  )
}
