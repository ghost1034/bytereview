'use client'

import { useState } from 'react'
import { ArrowLeft, FileText, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ExportButton, type ExportFormat } from '@/components/analytics/ExportButton'
import { useGenerateAnalyticsAmortizationSchedule } from '@/hooks/useAnalyticsAmortization'
import { useToast } from '@/hooks/use-toast'
import {
  computeNbv,
  getLifecycleStatus,
  resolveAssetsForReports,
  scheduleRowExpense,
} from '@/lib/analytics/amortizationHelpers'
import {
  REPORT_DEFS,
  type ReportKey,
  type ScheduleRow,
} from '@/lib/analytics/amortizationTypes'
import { exportRows, exportRowsMultiSheet } from '@/lib/analytics/exportData'
import type { AnalyticsAmortization, AnalyticsClient } from '@/lib/analytics/types'

interface AmortizationReportsProps {
  rows: AnalyticsAmortization[]
  clients: AnalyticsClient[]
  onBack: () => void
}

type Row = Record<string, string | number>

function clientName(clients: AnalyticsClient[], id: string | null | undefined): string {
  if (!id) return ''
  return clients.find((c) => c.id === id)?.name ?? ''
}

function schedulePeriod(row: ScheduleRow, index: number): string | number {
  return row.period ?? row.year ?? index + 1
}

function scheduleDate(row: ScheduleRow): string {
  if (typeof row.date === 'string' && row.date) return row.date
  if (typeof row.year === 'number') return `${row.year}-12-31`
  return ''
}

function buildGaapScheduleSheet(rows: AnalyticsAmortization[], clients: AnalyticsClient[]): Row[] {
  return rows.flatMap((r) => {
    const schedule = (r.schedule ?? []) as unknown as ScheduleRow[]
    if (schedule.length === 0) {
      return [
        {
          'Asset Name': r.asset_name,
          'Asset Type': r.asset_type,
          Client: clientName(clients, r.client_id),
          'GAAP Method': r.gaap_method ?? '',
          Period: '—',
          Date: r.start_date ?? '',
          Opening: r.cost_basis ?? '',
          Expense: 'No schedule — add cost basis, life, and start date',
          Closing: '',
        },
      ]
    }
    return schedule.map((s, i) => ({
      'Asset Name': r.asset_name,
      'Asset Type': r.asset_type,
      Client: clientName(clients, r.client_id),
      'GAAP Method': r.gaap_method ?? '',
      Period: schedulePeriod(s, i),
      Date: scheduleDate(s),
      Opening: s.openingBalance ?? '',
      Expense: scheduleRowExpense(s),
      Closing: s.closingBalance ?? s.liabBalance ?? '',
    }))
  })
}

function buildTaxScheduleSheet(rows: AnalyticsAmortization[], clients: AnalyticsClient[]): Row[] {
  return rows.flatMap((r) => {
    const tax = (r.tax_schedule ?? []) as unknown as ScheduleRow[]
    const taxMethod = r.tax_method ?? ''

    if (tax.length === 0) {
      return [
        {
          'Asset Name': r.asset_name,
          'Asset Type': r.asset_type,
          Client: clientName(clients, r.client_id),
          'Tax Method': taxMethod,
          Year: '—',
          Date: r.start_date ?? '',
          'MACRS Rate %': '',
          'Section 179': '',
          Bonus: '',
          'MACRS Depreciation': '',
          'Total Depreciation': taxMethod === 'MACRS'
            ? 'No tax schedule — regenerate from asset form'
            : 'No separate tax schedule for this method',
          'Tax Basis': '',
        },
      ]
    }

    let accumulated = 0
    return tax.map((s, i) => {
      const expense = scheduleRowExpense(s)
      accumulated += expense
      const ratePct =
        typeof s.macrsRate === 'number'
          ? s.macrsRate
          : typeof s.rate === 'number'
            ? s.rate * 100
            : ''
      return {
        'Asset Name': r.asset_name,
        'Asset Type': r.asset_type,
        Client: clientName(clients, r.client_id),
        'Tax Method': taxMethod,
        Year: schedulePeriod(s, i),
        Date: scheduleDate(s),
        'MACRS Rate %': ratePct,
        'Section 179': s.sec179 ?? '',
        Bonus: s.bonus ?? '',
        'MACRS Depreciation': s.macrsDep ?? '',
        'Total Depreciation': expense,
        'Tax Basis': s.taxBasis ?? s.basis ?? Math.max(0, (r.cost_basis ?? 0) - accumulated),
      }
    })
  })
}

function buildMonthlyExpenseSummary(rows: AnalyticsAmortization[]): Row[] {
  const byMonth = new Map<string, number>()
  for (const r of rows) {
    const schedule = (r.schedule ?? []) as unknown as ScheduleRow[]
    for (const s of schedule) {
      const date = scheduleDate(s)
      if (!date) continue
      const key = date.slice(0, 7)
      byMonth.set(key, (byMonth.get(key) ?? 0) + scheduleRowExpense(s))
    }
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, total]) => ({ Month: month, 'Total Expense': total }))
}

function buildGaapVsTax(rows: AnalyticsAmortization[], clients: AnalyticsClient[]): Row[] {
  const out: Row[] = []
  for (const r of rows) {
    const gaap = (r.schedule ?? []) as unknown as ScheduleRow[]
    const tax = (r.tax_schedule ?? []) as unknown as ScheduleRow[]
    const len = Math.max(gaap.length, tax.length)
    for (let i = 0; i < len; i++) {
      const g = gaap[i]
      const t = tax[i]
      out.push({
        'Asset Name': r.asset_name,
        Client: clientName(clients, r.client_id),
        Period: schedulePeriod(g ?? t ?? ({} as ScheduleRow), i),
        Date: scheduleDate(g ?? t ?? ({} as ScheduleRow)),
        'GAAP Expense': scheduleRowExpense(g),
        'Tax Expense': scheduleRowExpense(t),
        Difference: scheduleRowExpense(g) - scheduleRowExpense(t),
      })
    }
  }
  return out
}

function buildAssetRegister(rows: AnalyticsAmortization[], clients: AnalyticsClient[]): Row[] {
  return rows.map((r) => ({
    'Asset Name': r.asset_name,
    'Asset Type': r.asset_type,
    Client: clientName(clients, r.client_id),
    Vendor: r.vendor ?? '',
    'Cost Basis': r.cost_basis ?? 0,
    'Salvage Value': r.salvage_value ?? 0,
    'Useful Life (Months)': r.useful_life_months ?? 0,
    'GAAP Method': r.gaap_method ?? '',
    'Tax Method': r.tax_method ?? '',
    'Start Date': r.start_date ?? '',
    Status: getLifecycleStatus(r),
    NBV: computeNbv(r),
  }))
}

function buildGainLossDisposal(rows: AnalyticsAmortization[], clients: AnalyticsClient[]): Row[] {
  return rows
    .filter((r) => getLifecycleStatus(r).toLowerCase() === 'disposed')
    .map((r) => {
      const ts = (r.type_specific ?? {}) as Record<string, unknown>
      const cost = r.cost_basis ?? 0
      const gaapNbv = (ts.nbvAtDisposal as number) ?? computeNbv(r)
      const gaapAccum = (ts.disposalAccumDepr as number) ?? Math.max(0, cost - gaapNbv)
      const taxNbv = (ts.taxNbvAtDisposal as number) ?? gaapNbv
      const taxAccum = (ts.taxDisposalAccumDepr as number) ?? Math.max(0, cost - taxNbv)
      return {
        'Asset Name': r.asset_name,
        'Asset Type': r.asset_type,
        Client: clientName(clients, r.client_id),
        'Disposal Date': (ts.disposalDate as string) ?? '',
        'Cost Basis': cost,
        'GAAP Accum Depr': gaapAccum,
        'GAAP NBV': gaapNbv,
        'Tax Accum Depr': taxAccum,
        'Tax NBV': taxNbv,
        'Sale Proceeds': (ts.saleProceeds as number) ?? 0,
        'GAAP Gain / Loss': (ts.gaapGainLoss as number) ?? 0,
        'Tax Gain / Loss': (ts.taxGainLoss as number) ?? 0,
        'GAAP Method': r.gaap_method ?? '',
        'Tax Method': r.tax_method ?? '',
      }
    })
}

const BUILDERS: Record<
  Exclude<ReportKey, 'all_assets_schedule'>,
  (rows: AnalyticsAmortization[], clients: AnalyticsClient[]) => Row[]
> = {
  monthly_expense_summary: (rows) => buildMonthlyExpenseSummary(rows),
  gaap_vs_tax: buildGaapVsTax,
  asset_register: buildAssetRegister,
  gain_loss_disposal: buildGainLossDisposal,
}

const FILENAMES: Record<ReportKey, { prefix: string; sheet: string }> = {
  all_assets_schedule: { prefix: 'Amortization_All_Schedules', sheet: 'Schedules' },
  monthly_expense_summary: { prefix: 'Amortization_Monthly_Expense', sheet: 'Summary' },
  gaap_vs_tax: { prefix: 'Amortization_GAAP_vs_Tax', sheet: 'Comparison' },
  asset_register: { prefix: 'Amortization_Asset_Register', sheet: 'Register' },
  gain_loss_disposal: { prefix: 'Amortization_Gain_Loss', sheet: 'Disposals' },
}

export function AmortizationReports({ rows, clients, onBack }: AmortizationReportsProps) {
  const { toast } = useToast()
  const scheduleMutation = useGenerateAnalyticsAmortizationSchedule()
  const [exportingKey, setExportingKey] = useState<ReportKey | null>(null)

  const exportReport = async (key: ReportKey, format: ExportFormat) => {
    setExportingKey(key)
    try {
      const needsSchedules = key !== 'asset_register' && key !== 'gain_loss_disposal'
      const resolved = needsSchedules
        ? await resolveAssetsForReports(rows, (req) => scheduleMutation.mutateAsync(req))
        : rows

      if (key === 'all_assets_schedule') {
        const gaapRows = buildGaapScheduleSheet(resolved, clients)
        const taxRows = buildTaxScheduleSheet(resolved, clients)
        if (gaapRows.length === 0 && taxRows.length === 0) {
          toast({ title: 'Nothing to export', description: 'No rows match this report yet.' })
          return
        }
        await exportRowsMultiSheet(
          [
            { sheetName: 'GAAP Schedule', rows: gaapRows },
            { sheetName: 'Tax Schedule', rows: taxRows },
          ],
          format,
          FILENAMES.all_assets_schedule.prefix,
        )
        return
      }

      const data = BUILDERS[key](resolved, clients)
      if (data.length === 0) {
        toast({ title: 'Nothing to export', description: 'No rows match this report yet.' })
        return
      }
      const { prefix, sheet } = FILENAMES[key]
      await exportRows(data, format, prefix, sheet)
    } catch {
      toast({ title: 'Export failed', variant: 'destructive' })
    } finally {
      setExportingKey(null)
    }
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="mr-1.5 size-4" aria-hidden /> Back to portfolio
      </Button>

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No data to report on"
          description="Add at least one asset to generate reports."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {REPORT_DEFS.map((def) => (
            <ReportCard
              key={def.key}
              title={def.name}
              description={def.description}
              exporting={exportingKey === def.key}
              onExport={(f) => void exportReport(def.key, f)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ReportCard({
  title,
  description,
  exporting,
  onExport,
}: {
  title: string
  description: string
  exporting: boolean
  onExport: (format: ExportFormat) => void
}) {
  return (
    <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-card p-5">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileText className="size-4 text-foreground-muted" aria-hidden /> {title}
        </h3>
        <p className="text-sm text-foreground-muted">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        {exporting && (
          <span className="flex items-center gap-1.5 text-xs text-foreground-muted">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Building report…
          </span>
        )}
        <ExportButton onExport={onExport} label="Download" />
      </div>
    </div>
  )
}

export default AmortizationReports
