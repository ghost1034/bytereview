'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/ui/loading-state'
import { StepIndicator } from '@/components/ui/step-indicator'
import { useAnalyticsVariance } from '@/hooks/useAnalyticsVariance'
import {
  deriveVarianceStep,
  summarizeVarianceRecord,
  type VarianceActiveSummary,
  type VarianceStep,
} from '@/lib/analytics/varianceTypes'

import { VarianceConfigStep } from './VarianceConfigStep'
import { VarianceMappingStep } from './VarianceMappingStep'
import { VarianceResultsStep } from './VarianceResultsStep'
import { VarianceReviewStep } from './VarianceReviewStep'
import { VarianceUploadStep } from './VarianceUploadStep'

const STEPS = [
  { id: 'upload', label: 'Upload GL' },
  { id: 'mapping', label: 'Map columns' },
  { id: 'config', label: 'Thresholds' },
  { id: 'review', label: 'Review' },
  { id: 'results', label: 'Results' },
] as const

const STEP_INDEX: Record<VarianceStep, number> = {
  upload: 0,
  mapping: 1,
  config: 2,
  review: 3,
  results: 4,
}

interface VarianceEditorProps {
  analysisId: string
  onBack: () => void
  onSummaryChange?: (summary: VarianceActiveSummary | null) => void
}

export function VarianceEditor({ analysisId, onBack, onSummaryChange }: VarianceEditorProps) {
  const { data: record, isLoading } = useAnalyticsVariance(analysisId)
  const [stepOverride, setStepOverride] = useState<VarianceStep | null>(null)

  const derivedStep: VarianceStep = record ? deriveVarianceStep(record) : 'upload'
  const step: VarianceStep = stepOverride ?? derivedStep
  const stepIndex = STEP_INDEX[step]

  const summary = useMemo<VarianceActiveSummary | null>(() => {
    if (!record) return null
    return { ...summarizeVarianceRecord(record), step }
  }, [record, step])

  useEffect(() => {
    onSummaryChange?.(summary)
    return () => onSummaryChange?.(null)
  }, [summary, onSummaryChange])

  if (isLoading || !record) {
    return <LoadingState variant="page" label="Loading variance analysis" />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1.5 size-4" aria-hidden /> Back to analyses
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
          const target = STEPS[idx].id as VarianceStep
          const derivedIdx = STEP_INDEX[derivedStep]
          // Allow backtracking freely; don't let forward navigation jump past the derived step.
          if (idx <= derivedIdx) setStepOverride(target)
        }}
      />

      {step === 'upload' && (
        <VarianceUploadStep
          record={record}
          onComplete={() => setStepOverride('mapping')}
        />
      )}
      {step === 'mapping' && (
        <VarianceMappingStep
          record={record}
          onBack={() => setStepOverride('upload')}
          onComplete={() => setStepOverride('config')}
        />
      )}
      {step === 'config' && (
        <VarianceConfigStep
          record={record}
          onBack={() => setStepOverride('mapping')}
          onComplete={() => setStepOverride('review')}
        />
      )}
      {step === 'review' && (
        <VarianceReviewStep
          record={record}
          onBack={() => setStepOverride('config')}
          onComplete={() => setStepOverride('results')}
        />
      )}
      {step === 'results' && (
        <VarianceResultsStep
          record={record}
          onRestart={() => setStepOverride('upload')}
        />
      )}
    </div>
  )
}

export default VarianceEditor
