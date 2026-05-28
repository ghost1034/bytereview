'use client'

import { useState } from 'react'
import { FlaskConical, Loader2 } from 'lucide-react'

import DataUploadFlow from '@/components/analytics/DataUploadFlow'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useUpdateAnalyticsVariance } from '@/hooks/useAnalyticsVariance'
import { useToast } from '@/hooks/use-toast'
import type { AnalyticsAnalysis } from '@/lib/analytics/types'
import { MOCK_GL_DATA, MOCK_GL_HEADERS } from '@/lib/analytics/varianceHelpers'
import {
  readVarianceConfig,
  readVarianceData,
  type VarianceColumnMap,
  type VarianceRecordData,
} from '@/lib/analytics/varianceTypes'

interface VarianceUploadStepProps {
  record: AnalyticsAnalysis
  onComplete: () => void
}

interface UploadResult {
  sourceColumns?: string[]
  columnMapping?: Record<string, string> | Record<string, Record<string, string>>
  customColumns?: string[]
  rawData?: Record<string, unknown>[]
}

export function VarianceUploadStep({ record, onComplete }: VarianceUploadStepProps) {
  const { toast } = useToast()
  const updateMutation = useUpdateAnalyticsVariance()
  const [isProcessing, setIsProcessing] = useState(false)

  const config = readVarianceConfig(record)
  const uploadMode = config.uploadMode ?? 'dual'

  /**
   * Best-effort column auto-detection from headers so the mapping step
   * starts with sensible defaults. Mirrors CPAAnalytics' parseUploadedFile.
   */
  const autoMapColumns = (headers: string[]): VarianceColumnMap => {
    const map: VarianceColumnMap = {}
    for (const c of headers) {
      const lower = c.toLowerCase()
      if (!map.account && (lower.includes('account') || lower.includes('name'))) map.account = c
      else if (!map.amount && (lower.includes('amount') || lower.includes('value'))) map.amount = c
      else if (!map.period && (lower.includes('period') || lower.includes('date'))) map.period = c
      else if (!map.description && (lower.includes('desc') || lower.includes('memo'))) map.description = c
      else if (
        !map.department &&
        (lower.includes('dept') || lower.includes('class') || lower.includes('department'))
      )
        map.department = c
    }
    return map
  }

  const persistUpload = async ({
    rawData,
    headers,
    columnMap,
    customColumns,
  }: {
    rawData: Record<string, unknown>[]
    headers: string[]
    columnMap: VarianceColumnMap
    customColumns: string[]
  }) => {
    const data: VarianceRecordData = { rawData, headers }
    setIsProcessing(true)
    try {
      await updateMutation.mutateAsync({
        analysisId: record.id,
        data: {
          config: {
            ...config,
            columnMapping: columnMap,
            customColumns,
            customColumnMapping: {},
          } as unknown as Record<string, unknown>,
          data: data as unknown as Record<string, unknown>,
        },
      })
      toast({
        title: 'GL data loaded',
        description: `${rawData.length} row(s) parsed across ${headers.length} column(s).`,
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

  const handleComplete = async (payload?: UploadResult) => {
    const rawData = payload?.rawData ?? []
    if (rawData.length === 0) {
      toast({
        title: 'No rows found',
        description: 'Upload at least one row of GL data.',
        variant: 'destructive',
      })
      return
    }

    // DataUploadFlow may return columnMapping as flat (single mode) or per-source (dual mode).
    // Either shape, we collapse to a single VarianceColumnMap because variance treats both
    // periods as the same logical GL.
    const rawMapping = payload?.columnMapping ?? {}
    const flat: VarianceColumnMap = {}
    if (typeof rawMapping === 'object' && rawMapping !== null) {
      const values = Object.values(rawMapping)
      const isNested = values.length > 0 && typeof values[0] === 'object'
      if (isNested) {
        for (const inner of values as Record<string, string>[]) {
          for (const [k, v] of Object.entries(inner)) {
            const key = k as keyof VarianceColumnMap
            if (!flat[key] && v) flat[key] = v
          }
        }
      } else {
        for (const [k, v] of Object.entries(rawMapping as Record<string, string>)) {
          const key = k as keyof VarianceColumnMap
          flat[key] = v
        }
      }
    }

    // Fall back to header heuristics if DataUploadFlow didn't produce a mapping.
    const headers = payload?.sourceColumns ?? Object.keys(rawData[0] ?? {})
    if (!flat.account || !flat.amount) {
      const auto = autoMapColumns(headers)
      if (!flat.account && auto.account) flat.account = auto.account
      if (!flat.amount && auto.amount) flat.amount = auto.amount
      if (!flat.period && auto.period) flat.period = auto.period
      if (!flat.description && auto.description) flat.description = auto.description
      if (!flat.department && auto.department) flat.department = auto.department
    }

    await persistUpload({
      rawData,
      headers,
      columnMap: flat,
      customColumns: payload?.customColumns ?? [],
    })
  }

  const handleLoadSample = async () => {
    await persistUpload({
      rawData: MOCK_GL_DATA,
      headers: MOCK_GL_HEADERS,
      columnMap: {
        account: 'Account Name',
        amount: 'Amount',
        period: 'Date',
        department: 'Department',
      },
      customColumns: [],
    })
  }

  const existingData = readVarianceData(record)
  const hasExistingUpload = (existingData.rawData ?? []).length > 0

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>
          Upload GL data ({uploadMode === 'single' ? 'single file' : 'two files'})
        </AlertTitle>
        <AlertDescription>
          {uploadMode === 'single' ? (
            <>
              Upload one combined GL file containing both periods. You&rsquo;ll specify the date
              ranges on the next step. Expected columns: <code>Account</code>, <code>Amount</code>,
              <code> Date/Period</code>, plus optional <code>Department</code>,{' '}
              <code>Description</code>.
            </>
          ) : (
            <>
              Upload Base Period and Comparison Period as separate files. Each file should have
              <code> Account</code>, <code>Amount</code>, plus optional <code>Department</code> /{' '}
              <code>Description</code>.
            </>
          )}
        </AlertDescription>
      </Alert>

      {hasExistingUpload && (
        <Alert>
          <AlertTitle>You&rsquo;ve already uploaded data</AlertTitle>
          <AlertDescription>
            {(existingData.rawData ?? []).length} row(s) loaded. Uploading again will replace the
            current data and reset processed variances.
          </AlertDescription>
        </Alert>
      )}

      {isProcessing ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card p-12 text-sm text-foreground-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Saving GL data…
        </div>
      ) : (
        <>
          <DataUploadFlow
            module="variance"
            varianceMode={uploadMode}
            onComplete={handleComplete}
          />
          <div className="flex items-center justify-end">
            <Button variant="outline" size="sm" onClick={handleLoadSample}>
              <FlaskConical className="mr-1.5 size-4" aria-hidden /> Load sample GL
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

export default VarianceUploadStep
