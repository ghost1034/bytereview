'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/ui/loading-state'
import { StepIndicator } from '@/components/ui/step-indicator'
import { useAnalyticsReconciliation } from '@/hooks/useAnalyticsReconciliation'
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1.5 size-4" aria-hidden /> Back to reconciliations
        </Button>
        <div className="text-right">
          <div className="text-sm font-semibold text-foreground">{record.name}</div>
          <div className="text-xs uppercase tracking-wider text-foreground-muted">
            {record.status}
          </div>
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
          onComplete={() => setStepOverride(null)}
        />
      )}
      {step === 'rules' && (
        <ReconciliationRulesStep
          reconciliationId={reconciliationId}
          sourceA={sourceA}
          sourceB={sourceB}
          rules={rules}
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
        />
      )}
    </div>
  )
}

export default ReconciliationEditor
