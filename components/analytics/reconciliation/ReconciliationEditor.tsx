'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, Loader2, Lock, Send, Undo2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/ui/loading-state'
import { StepIndicator } from '@/components/ui/step-indicator'
import {
  useAnalyticsReconciliation,
  useUpdateAnalyticsReconciliation,
} from '@/hooks/useAnalyticsReconciliation'
import { useToast } from '@/hooks/use-toast'
import {
  deriveStep,
  summarizeRecord,
  type ReconciliationMatchGroup,
  type ReconciliationPass,
  type ReconciliationStep,
  type ReconciliationTransaction,
} from '@/lib/analytics/reconciliationTypes'
import { ReconciliationResultsStep } from './ReconciliationResultsStep'
import { ReconciliationRulesStep } from './ReconciliationRulesStep'
import { ReconciliationUploadStep } from './ReconciliationUploadStep'

const STEPS = [
  { id: 'upload', label: 'Upload sources' },
  { id: 'rules', label: 'Matching rules' },
  { id: 'results', label: 'Review results' },
] as const

const STEP_INDEX: Record<ReconciliationStep, number> = {
  upload: 0,
  rules: 1,
  results: 2,
}

type ReconciliationStatus = 'draft' | 'in_review' | 'approved' | 'finalized'

const STATUS_VARIANT: Record<ReconciliationStatus, 'default' | 'secondary' | 'outline'> = {
  draft: 'secondary',
  in_review: 'outline',
  approved: 'default',
  finalized: 'default',
}

const STATUS_LABEL: Record<ReconciliationStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  approved: 'Approved',
  finalized: 'Finalized',
}

export interface ReconciliationActiveSummary {
  id: string
  step: ReconciliationStep
  matchedGroups: number
  approvedGroups: number
  rejectedGroups: number
  unmatchedA: number
  unmatchedB: number
}

interface ReconciliationEditorProps {
  reconciliationId: string
  onBack: () => void
  onSummaryChange?: (summary: ReconciliationActiveSummary | null) => void
}

export function ReconciliationEditor({
  reconciliationId,
  onBack,
  onSummaryChange,
}: ReconciliationEditorProps) {
  const { data: record, isLoading } = useAnalyticsReconciliation(reconciliationId)
  const updateMutation = useUpdateAnalyticsReconciliation()
  const { toast } = useToast()
  const [stepOverride, setStepOverride] = useState<ReconciliationStep | null>(null)

  const derivedStep: ReconciliationStep = record ? deriveStep(record) : 'upload'
  const step: ReconciliationStep = stepOverride ?? derivedStep
  const stepIndex = STEP_INDEX[step]

  const summary = useMemo<ReconciliationActiveSummary | null>(() => {
    if (!record) return null
    const counts = summarizeRecord(record)
    return {
      id: record.id,
      step,
      ...counts,
    }
  }, [record, step])

  useEffect(() => {
    onSummaryChange?.(summary)
    return () => onSummaryChange?.(null)
  }, [summary, onSummaryChange])

  if (isLoading || !record) {
    return <LoadingState variant="page" label="Loading reconciliation" />
  }

  const sourceA = ((record.source_a ?? []) as unknown as ReconciliationTransaction[]) ?? []
  const sourceB = ((record.source_b ?? []) as unknown as ReconciliationTransaction[]) ?? []
  const matchGroups = ((record.match_groups ?? []) as unknown as ReconciliationMatchGroup[]) ?? []
  const rules = ((record.rules ?? []) as unknown as ReconciliationPass[]) ?? []
  const status = (record.status as ReconciliationStatus) ?? 'draft'
  const locked = status === 'finalized'

  const transition = async (next: ReconciliationStatus) => {
    try {
      await updateMutation.mutateAsync({
        reconciliationId,
        data: { status: next },
      })
      toast({ title: `Status: ${STATUS_LABEL[next]}` })
    } catch (error) {
      toast({
        title: 'Status update failed',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1.5 size-4" aria-hidden /> Back to reconciliations
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-semibold text-foreground">{record.name}</div>
            <div className="flex items-center justify-end gap-1.5">
              <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
              {locked && <Lock className="size-3.5 text-foreground-muted" aria-hidden />}
            </div>
          </div>
          <StatusActions
            status={status}
            pending={updateMutation.isPending}
            onTransition={transition}
          />
        </div>
      </div>

      <StepIndicator
        steps={STEPS.map((s) => ({ id: s.id, label: s.label }))}
        currentStep={stepIndex}
        onStepSelect={(idx) => {
          const target = STEPS[idx].id
          // Don't let the user jump forward to a step beyond what their data
          // currently supports — the derived step is the upper bound.
          const derivedIdx = STEP_INDEX[derivedStep]
          if (idx <= derivedIdx) setStepOverride(target)
        }}
      />

      {step === 'upload' && (
        <ReconciliationUploadStep
          reconciliationId={reconciliationId}
          locked={locked}
          onComplete={() => setStepOverride(null)}
        />
      )}
      {step === 'rules' && (
        <ReconciliationRulesStep
          reconciliationId={reconciliationId}
          sourceA={sourceA}
          sourceB={sourceB}
          rules={rules}
          locked={locked}
          onComplete={() => setStepOverride(null)}
        />
      )}
      {step === 'results' && (
        <ReconciliationResultsStep
          reconciliationId={reconciliationId}
          reconciliationName={record.name}
          sourceA={sourceA}
          sourceB={sourceB}
          matchGroups={matchGroups}
          locked={locked}
        />
      )}
    </div>
  )
}

function StatusActions({
  status,
  pending,
  onTransition,
}: {
  status: ReconciliationStatus
  pending: boolean
  onTransition: (next: ReconciliationStatus) => void
}) {
  const spinner = pending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden /> : null

  if (status === 'draft') {
    return (
      <Button size="sm" onClick={() => onTransition('in_review')} disabled={pending}>
        {spinner ?? <Send className="mr-1.5 size-3.5" aria-hidden />} Submit for review
      </Button>
    )
  }
  if (status === 'in_review') {
    return (
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onTransition('draft')}
          disabled={pending}
        >
          <Undo2 className="mr-1.5 size-3.5" aria-hidden /> Send back
        </Button>
        <Button size="sm" onClick={() => onTransition('approved')} disabled={pending}>
          {spinner ?? <CheckCircle2 className="mr-1.5 size-3.5" aria-hidden />} Approve
        </Button>
      </div>
    )
  }
  if (status === 'approved') {
    return (
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onTransition('in_review')}
          disabled={pending}
        >
          <Undo2 className="mr-1.5 size-3.5" aria-hidden /> Reopen
        </Button>
        <Button size="sm" onClick={() => onTransition('finalized')} disabled={pending}>
          {spinner ?? <Lock className="mr-1.5 size-3.5" aria-hidden />} Finalize
        </Button>
      </div>
    )
  }
  // finalized → only Reopen
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => onTransition('approved')}
      disabled={pending}
    >
      <Undo2 className="mr-1.5 size-3.5" aria-hidden /> Reopen
    </Button>
  )
}

export default ReconciliationEditor
