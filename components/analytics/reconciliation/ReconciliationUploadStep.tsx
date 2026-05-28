'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'

import DataUploadFlow from '@/components/analytics/DataUploadFlow'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useUpdateAnalyticsReconciliation } from '@/hooks/useAnalyticsReconciliation'
import { useToast } from '@/hooks/use-toast'
import {
  normalizeUploadedRow,
  type ReconciliationTransaction,
} from '@/lib/analytics/reconciliationTypes'

interface ReconciliationUploadStepProps {
  reconciliationId: string
  onComplete: () => void
  locked?: boolean
}

export function ReconciliationUploadStep({
  reconciliationId,
  onComplete,
  locked = false,
}: ReconciliationUploadStepProps) {
  const { toast } = useToast()
  const updateMutation = useUpdateAnalyticsReconciliation()
  const [isProcessing, setIsProcessing] = useState(false)

  const handleComplete = async (payload?: {
    columnMapping?: Record<string, Record<string, string>>
    rawData?: Record<string, unknown>[]
  }) => {
    const rawData = payload?.rawData ?? []
    const columnMapping = payload?.columnMapping ?? {}

    if (rawData.length === 0) {
      toast({
        title: 'No rows found',
        description: 'Upload at least one row for Source A and Source B.',
        variant: 'destructive',
      })
      return
    }

    const aRows = rawData.filter((r) => r._fileRole === 'Source A')
    const bRows = rawData.filter((r) => r._fileRole === 'Source B')

    if (aRows.length === 0 || bRows.length === 0) {
      toast({
        title: 'Two sources required',
        description: 'Reconciliation needs at least one row in each of Source A and Source B.',
        variant: 'destructive',
      })
      return
    }

    const mapA = columnMapping['Source A'] ?? {}
    const mapB = columnMapping['Source B'] ?? {}

    const sourceA: ReconciliationTransaction[] = aRows.map((r, i) =>
      normalizeUploadedRow(r, 'A', mapA, i),
    )
    const sourceB: ReconciliationTransaction[] = bRows.map((r, i) =>
      normalizeUploadedRow(r, 'B', mapB, i),
    )

    setIsProcessing(true)
    try {
      await updateMutation.mutateAsync({
        reconciliationId,
        data: {
          source_a: sourceA as unknown as Record<string, unknown>[],
          source_b: sourceB as unknown as Record<string, unknown>[],
        },
      })
      toast({
        title: 'Sources loaded',
        description: `${sourceA.length} row(s) in Source A, ${sourceB.length} in Source B.`,
      })
      onComplete()
    } catch (error) {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>Upload Source A and Source B</AlertTitle>
        <AlertDescription>
          Each file should have <code>Transaction Date</code>, <code>Description</code>, and{' '}
          <code>Amount</code> columns. Extra columns are carried through and can be used as
          matching criteria.
        </AlertDescription>
      </Alert>

      {locked ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-foreground-muted">
          This reconciliation is finalized. Reopen it to upload new sources.
        </div>
      ) : isProcessing ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card p-12 text-sm text-foreground-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Saving sources to reconciliation…
        </div>
      ) : (
        <DataUploadFlow module="reconciliation" onComplete={handleComplete} />
      )}
    </div>
  )
}

export default ReconciliationUploadStep
