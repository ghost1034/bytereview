'use client'

import { useMemo } from 'react'
import { ArrowLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'
import { DataTable, type ColumnDef } from '@/components/analytics/DataTable'
import { ExportButton, type ExportFormat } from '@/components/analytics/ExportButton'
import { useToast } from '@/hooks/use-toast'
import { exportRows } from '@/lib/analytics/exportData'
import type {
  ReconciliationMatchGroup,
  ReconciliationTransaction,
} from '@/lib/analytics/reconciliationTypes'
import type { AnalyticsClient, AnalyticsReconciliation } from '@/lib/analytics/types'

interface ReconciliationReportsProps {
  rows: AnalyticsReconciliation[]
  clients: AnalyticsClient[]
  onBack: () => void
}

interface ReconRollupRow {
  id: string
  Name: string
  Client: string
  Status: string
  'Source A rows': number
  'Source B rows': number
  'Match groups': number
  'Approved groups': number
  'Unmatched A': number
  'Unmatched B': number
  'Updated at': string
}

export function ReconciliationReports({ rows, clients, onBack }: ReconciliationReportsProps) {
  const { toast } = useToast()
  const clientNameById = useMemo(
    () => new Map(clients.map((c) => [c.id, c.name])),
    [clients],
  )

  const rollup = useMemo<ReconRollupRow[]>(
    () =>
      rows.map((r) => {
        const groups = (r.match_groups ?? []) as unknown as ReconciliationMatchGroup[]
        const sourceA = (r.source_a ?? []) as unknown as ReconciliationTransaction[]
        const sourceB = (r.source_b ?? []) as unknown as ReconciliationTransaction[]
        return {
          id: r.id,
          Name: r.name,
          Client: r.client_id ? clientNameById.get(r.client_id) ?? '' : '',
          Status: r.status,
          'Source A rows': sourceA.length,
          'Source B rows': sourceB.length,
          'Match groups': groups.length,
          'Approved groups': groups.filter((g) => g.status === 'approved').length,
          'Unmatched A': sourceA.filter((t) => t.status === 'unmatched').length,
          'Unmatched B': sourceB.filter((t) => t.status === 'unmatched').length,
          'Updated at': r.updated_at,
        }
      }),
    [rows, clientNameById],
  )

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
    exportRows(rowsForExport, format, 'Reconciliations_Rollup', 'Reconciliations').catch(() =>
      toast({ title: 'Export failed', variant: 'destructive' }),
    )
  }

  const handleAllMatchedExport = (format: ExportFormat) => {
    const out: Record<string, string | number | boolean | null | undefined>[] = []
    for (const r of rows) {
      const groups = (r.match_groups ?? []) as unknown as ReconciliationMatchGroup[]
      for (const g of groups) {
        out.push({
          Reconciliation: r.name,
          Client: r.client_id ? clientNameById.get(r.client_id) ?? '' : '',
          'Group ID': g.id,
          Type: g.type,
          Status: g.status,
          Confidence: g.confidence,
          'Total A': g.totalA,
          'Total B': g.totalB,
          'Source A IDs': (g.sourceAIds ?? []).join(', '),
          'Source B IDs': (g.sourceBIds ?? []).join(', '),
          Explanation: g.explanation,
        })
      }
    }
    if (out.length === 0) {
      toast({ title: 'Nothing to export' })
      return
    }
    exportRows(out, format, 'All_Match_Groups', 'Match groups').catch(() =>
      toast({ title: 'Export failed', variant: 'destructive' }),
    )
  }

  const handleAllUnmatchedExport = (format: ExportFormat) => {
    const out: Record<string, string | number | boolean | null | undefined>[] = []
    for (const r of rows) {
      const a = (r.source_a ?? []) as unknown as ReconciliationTransaction[]
      const b = (r.source_b ?? []) as unknown as ReconciliationTransaction[]
      const push = (t: ReconciliationTransaction) => {
        if (t.status === 'unmatched') {
          out.push({
            Reconciliation: r.name,
            Source: t.source,
            ID: t.id,
            Date: t.date,
            Description: t.description,
            Amount: t.amount,
            'Exception Category': t.exceptionCategory ?? '',
          })
        }
      }
      a.forEach(push)
      b.forEach(push)
    }
    if (out.length === 0) {
      toast({ title: 'Nothing to export' })
      return
    }
    exportRows(out, format, 'All_Unmatched_Transactions', 'Unmatched').catch(() =>
      toast({ title: 'Export failed', variant: 'destructive' }),
    )
  }

  const columns: ColumnDef<ReconRollupRow>[] = [
    { header: 'Name', accessorKey: 'Name', sortable: true },
    { header: 'Client', accessorKey: 'Client' },
    { header: 'Status', accessorKey: 'Status', sortable: true },
    { header: 'A', accessorKey: 'Source A rows', sortable: true },
    { header: 'B', accessorKey: 'Source B rows', sortable: true },
    { header: 'Groups', accessorKey: 'Match groups', sortable: true },
    { header: 'Approved', accessorKey: 'Approved groups', sortable: true },
    { header: 'Unmatched A', accessorKey: 'Unmatched A', sortable: true },
    { header: 'Unmatched B', accessorKey: 'Unmatched B', sortable: true },
  ]

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="mr-1.5 size-4" aria-hidden /> Back to reconciliations
      </Button>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Reconciliations" value={rows.length} />
        <StatCard label="Draft" value={statusCounts.draft ?? 0} />
        <StatCard label="In review" value={statusCounts.in_review ?? 0} />
        <StatCard
          label="Approved / Finalized"
          value={(statusCounts.approved ?? 0) + (statusCounts.finalized ?? 0)}
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-foreground">Rollup</div>
            <div className="text-xs text-foreground-muted">Counts per reconciliation</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ExportButton onExport={handleRollupExport} label="Export rollup" />
            <ExportButton onExport={handleAllMatchedExport} label="Export all matched" />
            <ExportButton onExport={handleAllUnmatchedExport} label="Export all unmatched" />
          </div>
        </div>
        <DataTable data={rollup} columns={columns} searchPlaceholder="Search rollup…" />
      </div>
    </div>
  )
}

export default ReconciliationReports
