'use client'

import * as React from 'react'
import { Info, Lock } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader } from '@/components/ui/page-header'
import { StepIndicator, type Step } from '@/components/ui/step-indicator'
import { cn } from '@/lib/utils'

export const JOB_WORKFLOW_STEPS: Step[] = [
  { id: 'upload', label: 'Upload', description: 'Add files', href: 'upload' },
  { id: 'fields', label: 'Fields', description: 'Define extraction', href: 'fields' },
  { id: 'review', label: 'Review', description: 'Confirm and start', href: 'review' },
  { id: 'processing', label: 'Processing', description: 'Run extraction', href: 'processing' },
  { id: 'results', label: 'Results', description: 'View and export', href: 'results' },
]

export type JobWorkflowStepId = (typeof JOB_WORKFLOW_STEPS)[number]['id']

interface JobWorkflowFrameProps {
  step: JobWorkflowStepId
  jobName?: string | null
  description?: React.ReactNode
  /** Right-aligned slot in the page header (typically a run selector) */
  runSelector?: React.ReactNode
  /** Render a read-only banner when true */
  readOnly?: boolean
  readOnlyMessage?: React.ReactNode
  /** Footer slot rendered as a sticky-ish action bar below content */
  footer?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function JobWorkflowFrame({
  step,
  jobName,
  description,
  runSelector,
  readOnly,
  readOnlyMessage,
  footer,
  children,
  className,
}: JobWorkflowFrameProps) {
  const currentIndex = JOB_WORKFLOW_STEPS.findIndex((s) => s.id === step)
  const safeIndex = currentIndex >= 0 ? currentIndex : 0
  const stepMeta = JOB_WORKFLOW_STEPS[safeIndex]

  return (
    <div className={cn('space-y-6', className)}>
      <PageHeader
        eyebrow={`Step ${safeIndex + 1} of ${JOB_WORKFLOW_STEPS.length}`}
        title={jobName || stepMeta?.label || 'Job'}
        description={description ?? `${stepMeta?.description ?? ''}`}
        actions={runSelector}
      />

      <StepIndicator
        steps={JOB_WORKFLOW_STEPS}
        currentStep={safeIndex}
      />

      {readOnly && (
        <Alert
          role="status"
          className="border-info/30 bg-info-soft text-foreground"
        >
          <Lock className="size-4 text-info" />
          <AlertDescription className="text-foreground-muted">
            {readOnlyMessage ??
              'This run is locked and cannot be modified. You can view but not change the configuration.'}
          </AlertDescription>
        </Alert>
      )}

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

interface WorkflowFooterProps {
  back?: React.ReactNode
  primary?: React.ReactNode
  secondary?: React.ReactNode
  className?: string
}

export function WorkflowFooter({
  back,
  primary,
  secondary,
  className,
}: WorkflowFooterProps) {
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

// Re-export Info for pages that import it through the frame
export { Info }
