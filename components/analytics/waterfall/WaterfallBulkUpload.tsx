'use client'

import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'

import DataUploadFlow from '@/components/analytics/DataUploadFlow'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { useCreateAnalyticsWaterfall } from '@/hooks/useAnalyticsWaterfall'
import { calculateWaterfall } from '@/lib/analytics/waterfallEngine'
import {
  RECOGNITION_METHODS,
  WATERFALL_SUBTYPES,
  createDefaultWaterfallForm,
  type RecognitionMethod,
  type WaterfallForm,
  type WaterfallSubtype,
} from '@/lib/analytics/waterfallTypes'

interface WaterfallBulkUploadProps {
  onBack: () => void
}

const str = (v: unknown) => (v == null ? '' : String(v).trim())
const num = (v: unknown) => {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''))
  return Number.isNaN(n) ? 0 : n
}

function normalizeSubtype(raw: string): WaterfallSubtype {
  const match = WATERFALL_SUBTYPES.find((s) => s.toLowerCase() === raw.toLowerCase())
  return match ?? 'Deferred Revenue'
}

function normalizeMethod(raw: string): RecognitionMethod {
  const match = RECOGNITION_METHODS.find((m) => m.toLowerCase() === raw.toLowerCase())
  return match ?? 'Straight-Line'
}

/** Build a WaterfallForm from a single parsed+mapped row. `get` reads by target column. */
function mapRow(get: (target: string) => unknown): WaterfallForm {
  return {
    ...createDefaultWaterfallForm(),
    type: normalizeSubtype(str(get('Type'))),
    name: str(get('Contract Name')) || 'Imported schedule',
    partyName: str(get('Party Name')),
    totalAmount: num(get('Total Amount')),
    startDate: str(get('Start Date')),
    endDate: str(get('End Date')),
    recognitionMethod: normalizeMethod(str(get('Recognition Method'))),
    expenseCategory: str(get('Expense Category')),
    paymentDate: str(get('Payment Date')),
    expectedPaymentDate: str(get('Expected Payment Date')),
    reversalMethod: str(get('Reversal Method')) || createDefaultWaterfallForm().reversalMethod,
    commissionType: str(get('Commission Type')) || createDefaultWaterfallForm().commissionType,
    benefitPeriodMethod:
      str(get('Benefit Period Method')) || createDefaultWaterfallForm().benefitPeriodMethod,
    deferredAccount: str(get('Deferred Account')) || createDefaultWaterfallForm().deferredAccount,
    revenueAccount: str(get('Revenue Account')) || createDefaultWaterfallForm().revenueAccount,
    prepaidAccount: str(get('Prepaid Account')) || createDefaultWaterfallForm().prepaidAccount,
    expenseAccount: str(get('Expense Account')) || createDefaultWaterfallForm().expenseAccount,
    liabilityAccount: str(get('Liability Account')) || createDefaultWaterfallForm().liabilityAccount,
    defCommAccount:
      str(get('Deferred Commission Account')) || createDefaultWaterfallForm().defCommAccount,
    commExpenseAccount:
      str(get('Commission Expense Account')) || createDefaultWaterfallForm().commExpenseAccount,
  }
}

export function WaterfallBulkUpload({ onBack }: WaterfallBulkUploadProps) {
  const { toast } = useToast()
  const createMutation = useCreateAnalyticsWaterfall()
  const [importing, setImporting] = useState(false)

  const handleComplete = async (payload?: {
    columnMapping?: Record<string, Record<string, string>>
    rawData?: Record<string, unknown>[]
  }) => {
    const rawData = payload?.rawData ?? []
    const columnMapping = payload?.columnMapping ?? {}
    const fileKey = Object.keys(columnMapping)[0]
    const map = (fileKey && columnMapping[fileKey]) || {}

    if (rawData.length === 0) {
      toast({ title: 'No rows found', description: 'The file had no data rows.', variant: 'destructive' })
      return
    }

    setImporting(true)
    let ok = 0
    let failed = 0
    for (const row of rawData) {
      const get = (target: string) => {
        const source = map[target]
        return source ? row[source] : row[target]
      }
      const form = mapRow(get)
      const { schedule, journalEntries } = calculateWaterfall(form)
      if (schedule.length === 0) {
        failed += 1
        continue
      }
      try {
        await createMutation.mutateAsync({
          type: 'waterfall',
          name: form.name,
          client_id: null,
          status: 'draft',
          config: form as unknown as Record<string, unknown>,
          data: schedule,
          results: journalEntries,
        })
        ok += 1
      } catch {
        failed += 1
      }
    }
    setImporting(false)

    toast({
      title: 'Bulk upload complete',
      description: `${ok} schedule${ok === 1 ? '' : 's'} created${failed ? `, ${failed} skipped` : ''}.`,
      variant: failed && !ok ? 'destructive' : undefined,
    })
    onBack()
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} disabled={importing}>
        <ArrowLeft className="mr-1.5 size-4" aria-hidden /> Back to schedules
      </Button>
      <DataUploadFlow module="waterfall" onComplete={handleComplete} onCancel={onBack} />
    </div>
  )
}

export default WaterfallBulkUpload
