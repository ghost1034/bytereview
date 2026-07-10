import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

export type EnvelopeStatus =
  | 'draft'
  | 'sent'
  | 'in_progress'
  | 'completed'
  | 'declined'
  | 'voided'
  | 'expired'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums',
  {
    variants: {
      tone: {
        neutral:
          'border-border bg-surface-muted text-foreground-muted',
        info: 'border-info/20 bg-info-soft text-info',
        success: 'border-success/20 bg-success-soft text-success',
        warning: 'border-warning/30 bg-warning-soft text-warning',
        destructive:
          'border-destructive/30 bg-destructive-soft text-destructive',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

interface EnvelopeStatusBadgeProps extends VariantProps<typeof badgeVariants> {
  status: EnvelopeStatus | string
  className?: string
}

const STATUS_META: Record<
  EnvelopeStatus,
  { label: string; tone: NonNullable<VariantProps<typeof badgeVariants>['tone']>; pulse?: boolean }
> = {
  draft: { label: 'Draft', tone: 'neutral' },
  sent: { label: 'Sent', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'info', pulse: true },
  completed: { label: 'Completed', tone: 'success' },
  declined: { label: 'Declined', tone: 'destructive' },
  voided: { label: 'Voided', tone: 'warning' },
  expired: { label: 'Expired', tone: 'warning' },
}

export function EnvelopeStatusBadge({ status, className }: EnvelopeStatusBadgeProps) {
  const meta = STATUS_META[status as EnvelopeStatus] ?? STATUS_META.draft
  return (
    <span className={cn(badgeVariants({ tone: meta.tone }), className)}>
      <span
        className={cn(
          'inline-block size-1.5 rounded-full',
          meta.tone === 'success' && 'bg-success',
          meta.tone === 'info' && 'bg-info',
          meta.tone === 'warning' && 'bg-warning',
          meta.tone === 'destructive' && 'bg-destructive',
          meta.tone === 'neutral' && 'bg-foreground-subtle',
          meta.pulse && 'animate-pulse',
        )}
        aria-hidden
      />
      {meta.label}
    </span>
  )
}
