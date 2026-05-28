'use client'

import { useMemo } from 'react'
import { ArrowLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'
import { DataTable, type ColumnDef } from '@/components/analytics/DataTable'
import { ExportButton, type ExportFormat } from '@/components/analytics/ExportButton'
import { useToast } from '@/hooks/use-toast'
import { exportRows } from '@/lib/analytics/exportData'
import { formatCurrency } from '@/lib/analytics/format'
import type { AnalyticsAnalysis, AnalyticsClient } from '@/lib/analytics/types'
import {
  readVarianceConfig,
  readVarianceData,
  readVarianceResults,
} from '@/lib/analytics/varianceTypes'

interface VarianceReportsProps {
  rows: AnalyticsAnalysis[]
  clients: AnalyticsClient[]
  onBack: () => void
}

interface RollupRow {
  id: string
  Name: string
  Client: string
  Status: string
  Type: string
  'Total rows': number
  Flagged: number
  Reviewed: number
  'Total |Variance|': number
  'Top variance': string
  Updated: string
}

export function VarianceReports({ rows, clients, onBack }: VarianceReportsProps) {
  const { toast } = useToast()
  const clientNameById = useMemo(
    () => new Map(clients.map((c) => [c.id, c.name])),
    [clients],
  )

  const rollup = useMemo<RollupRow[]>(
    () =>
      rows.map((r) => {
        const config = readVarianceConfig(r)
        const data = readVarianceData(r)
        const results = readVarianceResults(r)
        const processed = data.processed ?? []
        const flagged = processed.filter((p) => p.isFlagged).length
        const reviewed = processed.filter((p) => p.status !== 'Pending').length
        return {
          id: r.id,
          Name: r.name,
          Client: r.client_id ? clientNameById.get(r.client_id) ?? '' : '',
          Status: r.status,
          Type: config.type ?? '—',
          'Total rows': processed.length,
          Flagged: flagged,
          Reviewed: reviewed,
          'Total |Variance|': results?.totalAbsVariance ?? 0,
          'Top variance': results?.topVarianceAccountName ?? '—',
          Updated: r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '—',
        }
      }),
    [rows, clientNameById],
  )

  const totals = useMemo(() => {
    const flagged = rollup.reduce((s, r) => s + r.Flagged, 0)
    const reviewed = rollup.reduce((s, r) => s + r.Reviewed, 0)
    const absVariance = rollup.reduce((s, r) => s + r['Total |Variance|'], 0)
    return { flagged, reviewed, absVariance }
  }, [rollup])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1
    return counts
  }, [rows])

  const handleRollupExport = (format: ExportFormat) => {
    if (rollup.length === 0) {
      toast({ title: 'Nothing to export' })
      return
    }
    const rowsForExport = rollup.map((r) => {
      const { id, ...rest } = r
      void id
      return rest
    })
    exportRows(rowsForExport, format, 'Variance_Rollup', 'Variance rollup').catch(() =>
      toast({ title: 'Export failed', variant: 'destructive' }),
    )
  }

  const handleAllFlaggedExport = (format: ExportFormat) => {
    const out: Record<string, string | number | boolean | null | undefined>[] = []
    for (const r of rows) {
      const data = readVarianceData(r)
      for (const p of data.processed ?? []) {
        if (!p.isFlagged) continue
        out.push({
          Analysis: r.name,
          Client: r.client_id ? clientNameById.get(r.client_id) ?? '' : '',
          Account: p.accountName,
          Department: p.department ?? '',
          Base: p.baseAmount,
          Comparison: p.compAmount,
          Variance: p.variance,
          'Variance %':
            p.variancePercent === 'N/M' ? 'N/M' : (p.variancePercent as number).toFixed(2),
          Status: p.status,
          Explanation: p.explanation ?? '',
        })
      }
    }
    if (out.length === 0) {
      toast({ title: 'No flagged rows across analyses' })
      return
    }
    exportRows(out, format, 'All_Flagged_Variances', 'Flagged variances').catch(() =>
      toast({ title: 'Export failed', variant: 'destructive' }),
    )
  }

  const columns: ColumnDef<RollupRow>[] = [
    { header: 'Name', accessorKey: 'Name', sortable: true },
    { header: 'Client', accessorKey: 'Client' },
    { header: 'Status', accessorKey: 'Status', sortable: true },
    { header: 'Type', accessorKey: 'Type' },
    { header: 'Rows', accessorKey: 'Total rows', sortable: true },
    { header: 'Flagged', accessorKey: 'Flagged', sortable: true },
    { header: 'Reviewed', accessorKey: 'Reviewed', sortable: true },
    {
      header: '|Variance|',
      accessorKey: 'Total |Variance|',
      sortable: true,
      cell: (value) => <span className="tabular-nums">{formatCurrency(value as number)}</span>,
    },
    { header: 'Top variance', accessorKey: 'Top variance' },
    { header: 'Updated', accessorKey: 'Updated', sortable: true },
  ]

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="mr-1.5 size-4" aria-hidden /> Back to variance analyses
      </Button>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Analyses" value={rows.length} />
        <StatCard label="Total flagged" value={totals.flagged} />
        <StatCard label="Reviewed rows" value={totals.reviewed} />
        <StatCard label="Σ |Variance|" value={formatCurrency(totals.absVariance)} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Draft" value={statusCounts.Draft ?? 0} />
        <StatCard label="In Review" value={statusCounts['In Review'] ?? 0} />
        <StatCard label="Approved" value={statusCounts.Approved ?? 0} />
        <StatCard label="Finalized" value={statusCounts.Finalized ?? 0} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-foreground">Rollup</div>
            <div className="text-xs text-foreground-muted">Per-analysis flagged + variance totals.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ExportButton onExport={handleRollupExport} label="Export rollup" />
            <ExportButton onExport={handleAllFlaggedExport} label="Export all flagged" />
          </div>
        </div>
        <DataTable data={rollup} columns={columns} searchPlaceholder="Search rollup…" />
      </div>
    </div>
  )
}

export default VarianceReports
