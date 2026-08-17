'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, Loader2, Play } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useUpdateAnalyticsVariance } from '@/hooks/useAnalyticsVariance'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/analytics/format'
import type { AnalyticsAnalysis } from '@/lib/analytics/types'
import {
  aggregateVariancesWithStats,
  summarizeProcessed,
} from '@/lib/analytics/varianceEngine'
import { validateVariancePeriods } from '@/lib/analytics/variancePeriodValidation'
import {
  readVarianceConfig,
  readVarianceData,
  type VarianceConfig,
  type VarianceRecordData,
} from '@/lib/analytics/varianceTypes'

interface VarianceReviewStepProps {
  record: AnalyticsAnalysis
  onBack: () => void
  onComplete: () => void
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="text-foreground-muted">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}

export function VarianceReviewStep({ record, onBack, onComplete }: VarianceReviewStepProps) {
  const { toast } = useToast()
  const updateMutation = useUpdateAnalyticsVariance()
  const [isRunning, setIsRunning] = useState(false)

  const config = readVarianceConfig(record) as VarianceConfig
  const data = readVarianceData(record)
  const rowCount = (data.rawData ?? []).length

  const periodValidation = useMemo(
    () =>
      validateVariancePeriods({
        config,
        rawData: data.rawData ?? [],
        columnMap: config.columnMapping ?? {},
      }),
    [config, data.rawData],
  )

  const preview = useMemo(() => {
    if (!data.rawData || data.rawData.length === 0) return null
    try {
      return aggregateVariancesWithStats({
        rawData: data.rawData,
        columnMap: config.columnMapping ?? {},
        customColumns: config.customColumns ?? [],
        customColumnMapping: config.customColumnMapping ?? {},
        config,
      })
    } catch {
      return null
    }
  }, [data.rawData, config])

  const previewRows = preview?.variances ?? []
  const previewFlagged = previewRows.filter((r) => r.isFlagged)
  const hasEmptyPeriod = Boolean(
    preview && (preview.rowCounts.baseRows === 0 || preview.rowCounts.comparisonRows === 0),
  )

  const handleRun = async () => {
    if (!periodValidation.isValid) return
    if (hasEmptyPeriod) {
      toast({
        title: 'Selected period is empty',
        description: 'Both the base and comparison periods must contain at least one row.',
        variant: 'destructive',
      })
      return
    }
    if (!preview || previewRows.length === 0) {
      toast({ title: 'Nothing to aggregate', variant: 'destructive' })
      return
    }
    setIsRunning(true)
    try {
      const summary = summarizeProcessed(previewRows)
      const nextData: VarianceRecordData = {
        rawData: data.rawData,
        headers: data.headers,
        processed: previewRows,
      }
      await updateMutation.mutateAsync({
        analysisId: record.id,
        data: {
          data: nextData as unknown as Record<string, unknown>,
          results: summary as unknown as Record<string, unknown>,
          status: record.status === 'Draft' ? 'In Review' : record.status,
        },
      })
      toast({
        title: 'Analysis complete',
        description: `${summary.flaggedCount} flagged of ${summary.totalRows} groups.`,
      })
      onComplete()
    } catch (error) {
      toast({
        title: 'Run failed',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      })
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="space-y-6">
      <Alert>
        <AlertTitle>Review your configuration</AlertTitle>
        <AlertDescription>
          Confirm the setup below, then run the deterministic aggregation. You can come back and
          tweak any of these inputs later.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 text-sm font-semibold text-foreground">Source data</div>
          <SummaryRow label="Upload mode" value={config.uploadMode === 'single' ? 'Single file' : 'Two files'} />
          <SummaryRow label="Rows" value={rowCount.toLocaleString()} />
          <SummaryRow label="Columns" value={(data.headers ?? []).length} />
          <SummaryRow label="Custom dimensions" value={config.customColumns?.length ?? 0} />
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 text-sm font-semibold text-foreground">Thresholds</div>
          <SummaryRow label="Dollar" value={formatCurrency(config.thresholdDollar)} />
          <SummaryRow label="Percent" value={`${config.thresholdPercent}%`} />
          <SummaryRow label="Logic" value={config.logic} />
          <SummaryRow label="Account type" value={config.accountType} />
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 text-sm font-semibold text-foreground">Grouping</div>
          <div className="space-y-2 py-1.5">
            <div className="text-xs text-foreground-muted">Anchors</div>
            <div className="flex flex-wrap gap-1.5">
              {(config.analysisAnchors?.length ? config.analysisAnchors : ['Account']).map((a) => (
                <Badge key={a} variant="outline">
                  {a}
                </Badge>
              ))}
            </div>
          </div>
          <SummaryRow label="Comparison type" value={config.type} />
          {config.uploadMode === 'single' && (
            <>
              <SummaryRow
                label="Base period"
                value={`${config.basePeriodStart} → ${config.basePeriodEnd}`}
              />
              <SummaryRow
                label="Comparison period"
                value={`${config.compPeriodStart} → ${config.compPeriodEnd}`}
              />
            </>
          )}
        </section>
      </div>

      {preview && (
        <div className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
          <div className="mb-1 font-semibold text-foreground">Expected result</div>
          <p className="text-foreground-muted">
            Aggregation will produce <strong>{previewRows.length}</strong> grouped row(s), of which{' '}
            <strong>{previewFlagged.length}</strong> would be flagged at the current thresholds.
          </p>
          <p className="text-foreground-muted">
            <strong>{preview.rowCounts.baseRows}</strong> base rows,{' '}
            <strong>{preview.rowCounts.comparisonRows}</strong> comparison rows,{' '}
            <strong>{preview.rowCounts.excludedRows}</strong> excluded rows.
          </p>
        </div>
      )}

      {!periodValidation.isValid && (
        <Alert variant="destructive">
          <AlertTitle>Period setup needs attention</AlertTitle>
          <AlertDescription>{periodValidation.error}</AlertDescription>
        </Alert>
      )}

      {periodValidation.isValid && hasEmptyPeriod && (
        <Alert variant="destructive">
          <AlertTitle>Selected period is empty</AlertTitle>
          <AlertDescription>
            Both the base and comparison periods must contain at least one row before the analysis
            can run.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ChevronLeft className="mr-1.5 size-4" aria-hidden /> Back to thresholds
        </Button>
        <Button
          onClick={handleRun}
          disabled={isRunning || !preview || !periodValidation.isValid || hasEmptyPeriod}
        >
          {isRunning ? (
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
          ) : (
            <Play className="mr-2 size-4" aria-hidden />
          )}
          Run analysis
        </Button>
      </div>
    </div>
  )
}

export default VarianceReviewStep
