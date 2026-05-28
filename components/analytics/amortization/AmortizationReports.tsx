'use client'

import { ArrowLeft, FileText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ExportButton, type ExportFormat } from '@/components/analytics/ExportButton'
import { useToast } from '@/hooks/use-toast'
import { computeNbv } from '@/lib/analytics/amortizationHelpers'
import {
  REPORT_DEFS,
  type ReportKey,
  type ScheduleRow,
} from '@/lib/analytics/amortizationTypes'
import { exportRows } from '@/lib/analytics/exportData'
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

function buildAllAssetsSchedule(rows: AnalyticsAmortization[], clients: AnalyticsClient[]): Row[] {
  return rows.flatMap((r) => {
    const schedule = (r.schedule ?? []) as unknown as ScheduleRow[]
    return schedule.map((s) => ({
      'Asset Name': r.asset_name,
      'Asset Type': r.asset_type,
      Client: clientName(clients, r.client_id),
      Period: s.period,
      Date: s.date,
      Opening: s.openingBalance ?? '',
      Expense: s.expense ?? s.totalExpense ?? '',
      Closing: s.closingBalance ?? s.liabBalance ?? '',
    }))
  })
}

function buildMonthlyExpenseSummary(rows: AnalyticsAmortization[]): Row[] {
  const byMonth = new Map<string, number>()
  for (const r of rows) {
    const schedule = (r.schedule ?? []) as unknown as ScheduleRow[]
    for (const s of schedule) {
      if (!s.date) continue
      const key = s.date.slice(0, 7)
      const expense = (s.expense ?? s.totalExpense ?? 0) as number
      byMonth.set(key, (byMonth.get(key) ?? 0) + expense)
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
        Period: g?.period ?? t?.period ?? i + 1,
        Date: g?.date ?? t?.date ?? '',
        'GAAP Expense': (g?.expense ?? g?.totalExpense ?? 0) as number,
        'Tax Expense': (t?.expense ?? 0) as number,
        Difference:
          ((g?.expense ?? g?.totalExpense ?? 0) as number) - ((t?.expense ?? 0) as number),
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
    Status: r.status ?? '',
    NBV: computeNbv(r),
  }))
}

function buildGainLossDisposal(rows: AnalyticsAmortization[], clients: AnalyticsClient[]): Row[] {
  return rows
    .filter((r) => (r.status ?? '').toLowerCase() === 'disposed')
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

const BUILDERS: Record<ReportKey, (rows: AnalyticsAmortization[], clients: AnalyticsClient[]) => Row[]> = {
  all_assets_schedule: buildAllAssetsSchedule,
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

  const exportReport = (key: ReportKey, format: ExportFormat) => {
    const data = BUILDERS[key](rows, clients)
    if (data.length === 0) {
      toast({ title: 'Nothing to export', description: 'No rows match this report yet.' })
      return
    }
    const { prefix, sheet } = FILENAMES[key]
    exportRows(data, format, prefix, sheet).catch(() =>
      toast({ title: 'Export failed', variant: 'destructive' }),
    )
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
              onExport={(f) => exportReport(def.key, f)}
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
  onExport,
}: {
  title: string
  description: string
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
      <div>
        <ExportButton onExport={onExport} label="Download" />
      </div>
    </div>
  )
}

export default AmortizationReports
