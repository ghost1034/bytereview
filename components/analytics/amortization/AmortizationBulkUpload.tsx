'use client'

import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'

import DataUploadFlow from '@/components/analytics/DataUploadFlow'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import {
  useCreateAnalyticsAmortization,
  useGenerateAnalyticsAmortizationSchedule,
} from '@/hooks/useAnalyticsAmortization'
import { splitFormForApi, buildMacrsScheduleRequest, normalizeMacrsScheduleRows } from '@/lib/analytics/amortizationHelpers'
import {
  CSV_COLUMN_MAP,
  createDefaultAmortizationForm,
  type AmortizationForm,
  type ScheduleRow,
} from '@/lib/analytics/amortizationTypes'

interface AmortizationBulkUploadProps {
  onBack: () => void
}

const str = (v: unknown) => (v == null ? '' : String(v).trim())
const num = (v: unknown) => {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''))
  return Number.isNaN(n) ? 0 : n
}
const bool = (v: unknown) => {
  const s = String(v ?? '').toLowerCase()
  return s === 'true' || s === 'yes' || s === 'y' || s === '1'
}

/** Map a single CSV row (via the column-mapping callback) into a partial AmortizationForm. */
function mapRow(get: (target: string) => unknown): AmortizationForm {
  const base = createDefaultAmortizationForm()
  const result: AmortizationForm = { ...base }

  const writable = result as unknown as Record<string, unknown>
  for (const [csvCol, formKey] of Object.entries(CSV_COLUMN_MAP)) {
    const raw = get(csvCol)
    if (raw == null || raw === '') continue
    // Coerce based on the field's expected type.
    if (
      formKey === 'costBasis' ||
      formKey === 'salvageValue' ||
      formKey === 'paymentAmount' ||
      formKey === 'ibr' ||
      formKey === 'principalAmount' ||
      formKey === 'interestRate' ||
      formKey === 'balloonPayment' ||
      formKey === 'section179Amount' ||
      formKey === 'totalCapitalizedCost' ||
      formKey === 'businessUsePercentage'
    ) {
      writable[formKey] = num(raw)
    } else if (
      formKey === 'usefulLifeMonths' ||
      formKey === 'loanTerm' ||
      formKey === 'amortizationTerm' ||
      formKey === 'legalLife'
    ) {
      writable[formKey] = Math.round(num(raw))
    } else if (
      formKey === 'isQip' ||
      formKey === 'section179Election' ||
      formKey === 'bonusDepreciationElection' ||
      formKey === 'listedProperty'
    ) {
      writable[formKey] = bool(raw)
    } else {
      writable[formKey] = str(raw)
    }
  }

  if (!result.assetName) result.assetName = 'Imported asset'
  if (!result.assetType) result.assetType = base.assetType
  return result
}

export function AmortizationBulkUpload({ onBack }: AmortizationBulkUploadProps) {
  const { toast } = useToast()
  const createMutation = useCreateAnalyticsAmortization()
  const scheduleMutation = useGenerateAnalyticsAmortizationSchedule()
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
      toast({
        title: 'No rows found',
        description: 'The file had no data rows.',
        variant: 'destructive',
      })
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
      try {
        let schedule: ScheduleRow[] = []
        let taxSchedule: ScheduleRow[] = []
        if (form.usefulLifeMonths > 0 && form.costBasis > 0 && form.startDate) {
          const res = await scheduleMutation.mutateAsync({
            assetType: form.assetType,
            method: 'straight_line',
            costBasis: form.costBasis,
            salvageValue: form.salvageValue,
            usefulLifeMonths: form.usefulLifeMonths,
            startDate: form.startDate,
          })
          schedule = (res.schedule ?? []) as unknown as ScheduleRow[]

          if (form.taxMethod === 'MACRS') {
            try {
              const taxRes = await scheduleMutation.mutateAsync(buildMacrsScheduleRequest(form))
              taxSchedule = normalizeMacrsScheduleRows(
                (taxRes.schedule ?? []) as unknown as ScheduleRow[],
                form.costBasis ?? 0,
              )
            } catch {
              // Bulk import is forgiving: a tax-schedule failure shouldn't drop the asset.
            }
          }
        }
        const payload = splitFormForApi(form)
        await createMutation.mutateAsync({ ...payload, schedule, tax_schedule: taxSchedule })
        ok += 1
      } catch {
        failed += 1
      }
    }
    setImporting(false)

    toast({
      title: 'Bulk upload complete',
      description: `${ok} asset${ok === 1 ? '' : 's'} created${failed ? `, ${failed} skipped` : ''}.`,
      variant: failed && !ok ? 'destructive' : undefined,
    })
    onBack()
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} disabled={importing}>
        <ArrowLeft className="mr-1.5 size-4" aria-hidden /> Back to portfolio
      </Button>
      <DataUploadFlow module="amortization" onComplete={handleComplete} onCancel={onBack} />
    </div>
  )
}

export default AmortizationBulkUpload
