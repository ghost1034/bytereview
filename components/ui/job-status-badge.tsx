import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

export type JobStatus =
  | 'pending'
  | 'in_progress'
  | 'processing'
  | 'partially_completed'
  | 'completed'
  | 'failed'
  | 'cancelled'

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

interface JobStatusBadgeProps
  extends VariantProps<typeof badgeVariants> {
  status: JobStatus
  className?: string
}

const STATUS_META: Record<
  JobStatus,
  { label: string; tone: NonNullable<VariantProps<typeof badgeVariants>['tone']>; pulse?: boolean }
> = {
  pending: { label: 'Pending', tone: 'neutral' },
  in_progress: { label: 'Processing', tone: 'info', pulse: true },
  processing: { label: 'Processing', tone: 'info', pulse: true },
  partially_completed: { label: 'Partial', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
  failed: { label: 'Failed', tone: 'destructive' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

export function JobStatusBadge({ status, className }: JobStatusBadgeProps) {
  const meta = STATUS_META[status] ?? STATUS_META.pending
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
