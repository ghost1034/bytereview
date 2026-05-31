'use client'

import { useMemo, useState } from 'react'
import { Loader2, RotateCcw, Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ExportButton, type ExportFormat } from '@/components/analytics/ExportButton'
import {
  useAnalyzeVariance,
  useUpdateAnalyticsVariance,
} from '@/hooks/useAnalyticsVariance'
import { useToast } from '@/hooks/use-toast'
import { exportRows } from '@/lib/analytics/exportData'
import { formatCurrency } from '@/lib/analytics/format'
import type { AnalyticsAnalysis } from '@/lib/analytics/types'
import { summarizeProcessed } from '@/lib/analytics/varianceEngine'
import { WORKFLOW_STATUS_VARIANT, WORKFLOW_TRANSITIONS } from '@/lib/analytics/varianceHelpers'
import {
  readVarianceConfig,
  readVarianceData,
  type VarianceData,
  type VarianceRecordData,
  type VarianceWorkflowStatus,
} from '@/lib/analytics/varianceTypes'

import { VarianceCharts } from './VarianceCharts'
import { VarianceDetailPanel } from './VarianceDetailPanel'
import { VarianceMemoTab } from './VarianceMemoTab'
import { VarianceTable } from './VarianceTable'

interface VarianceResultsStepProps {
  record: AnalyticsAnalysis
  onRestart: () => void
}

export function VarianceResultsStep({ record, onRestart }: VarianceResultsStepProps) {
  const { toast } = useToast()
  const analyzeMutation = useAnalyzeVariance()
  const updateMutation = useUpdateAnalyticsVariance()
  const [selectedRow, setSelectedRow] = useState<VarianceData | null>(null)

  const data = readVarianceData(record)
  const config = readVarianceConfig(record)
  const processed = useMemo(() => data.processed ?? [], [data])

  const flagged = useMemo(() => processed.filter((p) => p.isFlagged), [processed])
  const explained = useMemo(() => processed.filter((p) => p.explanation), [processed])

  const totalAbsVariance = processed.reduce((s, r) => s + r.absVariance, 0)

  const handleAnalyze = async () => {
    if (flagged.length === 0) {
      toast({
        title: 'Nothing to explain',
        description: 'No rows are currently flagged at your thresholds.',
      })
      return
    }
    try {
      const response = await analyzeMutation.mutateAsync({
        data: flagged as unknown as Record<string, unknown>[],
      })
      const explanations = (response.explanations ?? []) as Record<string, unknown>[]
      const explanationsById = new Map<string, Record<string, unknown>>()
      for (const e of explanations) {
        if (typeof e.id === 'string') explanationsById.set(e.id, e)
      }
      const merged: VarianceData[] = processed.map((row) => {
        const ex = explanationsById.get(row.id)
        if (!ex) return row
        const nextStatus =
          row.isFlagged &&
          row.status !== 'Accepted' &&
          row.status !== 'Edited' &&
          row.status !== 'Rejected'
            ? 'Pending'
            : row.status
        return {
          ...row,
          explanation: typeof ex.explanation === 'string' ? ex.explanation : row.explanation,
          confidence: (ex.confidence as VarianceData['confidence']) ?? row.confidence,
          followUp: typeof ex.followUp === 'string' ? ex.followUp : row.followUp,
          status: row.isFlagged ? nextStatus : 'Accepted',
        }
      })
      const nextData: VarianceRecordData = {
        rawData: data.rawData,
        headers: data.headers,
        processed: merged,
      }
      await updateMutation.mutateAsync({
        analysisId: record.id,
        data: {
          data: nextData as unknown as Record<string, unknown>,
          results: summarizeProcessed(merged) as unknown as Record<string, unknown>,
        },
      })
      toast({
        title: 'Explanations added',
        description: `${explanations.length} row(s) explained.`,
      })
    } catch (error) {
      toast({
        title: 'AI analysis failed',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      })
    }
  }

  const handleRowSave = async (updated: VarianceData) => {
    const merged = processed.map((r) => (r.id === updated.id ? updated : r))
    const nextData: VarianceRecordData = {
      rawData: data.rawData,
      headers: data.headers,
      processed: merged,
    }
    try {
      await updateMutation.mutateAsync({
        analysisId: record.id,
        data: {
          data: nextData as unknown as Record<string, unknown>,
          results: summarizeProcessed(merged) as unknown as Record<string, unknown>,
        },
      })
      setSelectedRow(updated)
    } catch (error) {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      })
    }
  }

  const handleStatusTransition = async (next: string) => {
    try {
      await updateMutation.mutateAsync({
        analysisId: record.id,
        data: { status: next },
      })
      toast({ title: `Status set to ${next}` })
    } catch (error) {
      toast({
        title: 'Status change failed',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      })
    }
  }

  const handleExport = (format: ExportFormat) => {
    if (processed.length === 0) {
      toast({ title: 'Nothing to export' })
      return
    }
    const exportable = processed.map((r) => ({
      Account: r.accountName,
      Type: r.accountType ?? '',
      Department: r.department ?? '',
      'Base Amount': r.baseAmount,
      'Comparison Amount': r.compAmount,
      Variance: r.variance,
      'Variance %': r.variancePercent === 'N/M' ? 'N/M' : (r.variancePercent as number).toFixed(2),
      Flagged: r.isFlagged ? 'Yes' : 'No',
      Favorable: r.isFavorable === null ? '' : r.isFavorable ? 'Yes' : 'No',
      Status: r.isFlagged ? r.status : 'Below threshold',
      Confidence: r.confidence ?? '',
      Explanation: r.explanation ?? '',
      'Follow-up': r.followUp ?? '',
    }))
    exportRows(
      exportable,
      format,
      record.name.replace(/[^\w-]+/g, '_'),
      'Variance Results',
    ).catch(() => toast({ title: 'Export failed', variant: 'destructive' }))
  }

  const workflowAction =
    WORKFLOW_TRANSITIONS[record.status as VarianceWorkflowStatus] ??
    WORKFLOW_TRANSITIONS.Draft
  const isFinalized = record.status === 'Finalized'

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total rows" value={processed.length} />
        <StatCard label="Flagged" value={flagged.length} />
        <StatCard label="Explained" value={explained.length} />
        <StatCard label="Total |Variance|" value={formatCurrency(totalAbsVariance)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Badge variant={WORKFLOW_STATUS_VARIANT[record.status] ?? 'secondary'}>
            {record.status}
          </Badge>
          {!isFinalized && workflowAction.next && (
            <Button
              size="sm"
              variant="default"
              onClick={() => handleStatusTransition(workflowAction.next as string)}
              disabled={updateMutation.isPending}
            >
              {workflowAction.label}
            </Button>
          )}
          {workflowAction.rollback && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleStatusTransition(workflowAction.rollback as string)}
              disabled={updateMutation.isPending}
            >
              Request changes
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleAnalyze}
            disabled={analyzeMutation.isPending || flagged.length === 0}
          >
            {analyzeMutation.isPending ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="mr-1.5 size-4" aria-hidden />
            )}
            Explain variances
          </Button>
          <ExportButton onExport={handleExport} label="Export rows" />
          <Button variant="ghost" size="sm" onClick={onRestart}>
            <RotateCcw className="mr-1.5 size-4" aria-hidden /> New import
          </Button>
        </div>
      </div>

      <Tabs defaultValue="table">
        <TabsList>
          <TabsTrigger value="table">Table</TabsTrigger>
          <TabsTrigger value="charts">Charts</TabsTrigger>
          <TabsTrigger value="memo">Memo</TabsTrigger>
        </TabsList>

        <TabsContent value="table" className="mt-4">
          <VarianceTable rows={processed} onRowClick={setSelectedRow} />
        </TabsContent>

        <TabsContent value="charts" className="mt-4">
          <VarianceCharts rows={processed} />
        </TabsContent>

        <TabsContent value="memo" className="mt-4">
          <VarianceMemoTab record={record} />
        </TabsContent>
      </Tabs>

      <VarianceDetailPanel
        analysisId={record.id}
        row={selectedRow}
        canEdit={!isFinalized}
        accountType={config.accountType}
        customColumns={config.customColumns ?? []}
        onClose={() => setSelectedRow(null)}
        onSave={handleRowSave}
      />
    </div>
  )
}

export default VarianceResultsStep
