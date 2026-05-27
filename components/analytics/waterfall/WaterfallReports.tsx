'use client'

import { ArrowLeft, FileText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ExportButton, type ExportFormat } from '@/components/analytics/ExportButton'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/hooks/use-toast'
import { exportRows } from '@/lib/analytics/exportData'
import type { SavedWaterfall } from '@/lib/analytics/waterfallData'
import { periodToYYYYMM } from '@/lib/analytics/waterfallEngine'
import type { WaterfallSubtype } from '@/lib/analytics/waterfallTypes'

interface WaterfallReportsProps {
  rows: SavedWaterfall[]
  onBack: () => void
}

/** Flatten every schedule row across contracts — one row per period per contract. */
function buildAllSchedules(rows: SavedWaterfall[]) {
  return rows.flatMap((w) =>
    w.schedule.map((s) => ({
      'Contract Name': w.name,
      Type: w.form.type,
      Party: w.form.partyName,
      Period: s.period,
      Opening: s.opening,
      Recognized: s.recognized,
      Closing: s.closing,
      Cumulative: s.cumulative,
      Remaining: s.remaining,
    })),
  )
}

/** Recognized + ending balance per period, split by subtype. */
function buildMonthlySummary(rows: SavedWaterfall[]) {
  const SUBTYPES: WaterfallSubtype[] = [
    'Deferred Revenue',
    'Prepaid Expenses',
    'Accrued Expenses',
    'Deferred Commission',
  ]
  const byPeriod = new Map<
    string,
    { recognized: Record<WaterfallSubtype, number>; ending: Record<WaterfallSubtype, number> }
  >()

  for (const w of rows) {
    for (const s of w.schedule) {
      let bucket = byPeriod.get(s.period)
      if (!bucket) {
        const zero = () =>
          ({
            'Deferred Revenue': 0,
            'Prepaid Expenses': 0,
            'Accrued Expenses': 0,
            'Deferred Commission': 0,
          }) as Record<WaterfallSubtype, number>
        bucket = { recognized: zero(), ending: zero() }
        byPeriod.set(s.period, bucket)
      }
      bucket.recognized[w.form.type] += s.recognized
      bucket.ending[w.form.type] += s.closing
    }
  }

  return Array.from(byPeriod.entries())
    .sort(([a], [b]) => (periodToYYYYMM(a) ?? 0) - (periodToYYYYMM(b) ?? 0))
    .map(([period, b]) => {
      const totalRecognized = SUBTYPES.reduce((sum, t) => sum + b.recognized[t], 0)
      const totalEnding = SUBTYPES.reduce((sum, t) => sum + b.ending[t], 0)
      const row: Record<string, string | number> = { Period: period, 'Total Recognized': totalRecognized }
      for (const t of SUBTYPES) {
        row[`${t} Recognized`] = b.recognized[t]
        row[`${t} Ending`] = b.ending[t]
      }
      row['Total Ending Balance'] = totalEnding
      return row
    })
}

export function WaterfallReports({ rows, onBack }: WaterfallReportsProps) {
  const { toast } = useToast()

  const exportReport = (
    builder: (rows: SavedWaterfall[]) => Record<string, string | number>[],
    prefix: string,
    sheet: string,
    format: ExportFormat,
  ) => {
    const data = builder(rows)
    if (data.length === 0) {
      toast({ title: 'Nothing to export', description: 'Save a schedule first.' })
      return
    }
    exportRows(data, format, prefix, sheet).catch(() =>
      toast({ title: 'Export failed', variant: 'destructive' }),
    )
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="mr-1.5 size-4" aria-hidden /> Back to schedules
      </Button>

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No data to report on"
          description="Create at least one waterfall schedule to generate reports."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ReportCard
            title="All Waterfall Schedules"
            description="Full period-by-period detail across every contract — one row per period."
            onExport={(f) => exportReport(buildAllSchedules, 'Waterfall_All_Schedules', 'Schedules', f)}
          />
          <ReportCard
            title="Monthly Recognition Summary"
            description="Recognized amounts and ending balances aggregated by period and subtype."
            onExport={(f) => exportReport(buildMonthlySummary, 'Waterfall_Monthly_Summary', 'Summary', f)}
          />
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

export default WaterfallReports
