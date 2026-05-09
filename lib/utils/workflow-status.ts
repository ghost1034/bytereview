/**
 * Shared status -> display config map for the job workflow.
 *
 * Used by ProcessingStep, ResultsStep, EnhancedFileUpload, and EditableResultsTable
 * so a single map drives icon, label, and tone across every workflow surface.
 */

import {
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  Play,
  XCircle,
} from 'lucide-react'

export type WorkflowStatus =
  | 'pending'
  | 'queued'
  | 'in_progress'
  | 'processing'
  | 'running'
  | 'extracting'
  | 'completed'
  | 'partially_completed'
  | 'failed'
  | 'cancelled'

export type StatusTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'destructive'

export interface StatusMeta {
  label: string
  tone: StatusTone
  icon: React.ComponentType<{ className?: string }>
  /** Whether the icon should pulse (active states) */
  pulse?: boolean
}

export const WORKFLOW_STATUS_META: Record<WorkflowStatus, StatusMeta> = {
  pending: { label: 'Pending', tone: 'neutral', icon: Clock },
  queued: { label: 'Queued', tone: 'neutral', icon: Clock },
  extracting: { label: 'Extracting', tone: 'info', icon: Loader2, pulse: true },
  in_progress: { label: 'Processing', tone: 'info', icon: Loader2, pulse: true },
  processing: { label: 'Processing', tone: 'info', icon: Play, pulse: true },
  running: { label: 'Running', tone: 'info', icon: Play, pulse: true },
  completed: { label: 'Completed', tone: 'success', icon: CheckCircle },
  partially_completed: { label: 'Partial', tone: 'warning', icon: AlertCircle },
  failed: { label: 'Failed', tone: 'destructive', icon: XCircle },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: AlertCircle },
}

/** Returns the display meta for any status string, falling back to "pending". */
export function getStatusMeta(status: string | null | undefined): StatusMeta {
  if (!status) return WORKFLOW_STATUS_META.pending
  return (
    (WORKFLOW_STATUS_META as Record<string, StatusMeta>)[status] ??
    WORKFLOW_STATUS_META.pending
  )
}

/** Tailwind text-color class for a tone, using semantic tokens. */
export function statusTextColorClass(tone: StatusTone): string {
  switch (tone) {
    case 'success':
      return 'text-success'
    case 'info':
      return 'text-info'
    case 'warning':
      return 'text-warning'
    case 'destructive':
      return 'text-destructive'
    case 'neutral':
    default:
      return 'text-foreground-muted'
  }
}

/** Tailwind bg-color class for a tone (solid bar fills, etc.). */
export function statusBgColorClass(tone: StatusTone): string {
  switch (tone) {
    case 'success':
      return 'bg-success'
    case 'info':
      return 'bg-info'
    case 'warning':
      return 'bg-warning'
    case 'destructive':
      return 'bg-destructive'
    case 'neutral':
    default:
      return 'bg-foreground-subtle'
  }
}
