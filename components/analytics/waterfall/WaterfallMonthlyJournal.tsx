'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, BookOpen } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { DataTable, type ColumnDef } from '@/components/analytics/DataTable'
import { ExportButton, type ExportFormat } from '@/components/analytics/ExportButton'
import { useToast } from '@/hooks/use-toast'
import { currentMonthKey, formatCurrency } from '@/lib/analytics/format'
import { exportRows } from '@/lib/analytics/exportData'
import type { SavedWaterfall } from '@/lib/analytics/waterfallData'
import {
  buildMonthlyJournalEntries,
  type MonthlyJournalRow,
} from '@/lib/analytics/waterfallEngine'

interface WaterfallMonthlyJournalProps {
  rows: SavedWaterfall[]
  onBack: () => void
}

/**
 * Cross-schedule month-end journal-entries view: pick a month, see every
 * recognition line booked across the firm's saved waterfalls, export.
 */
export function WaterfallMonthlyJournal({ rows, onBack }: WaterfallMonthlyJournalProps) {
  const { toast } = useToast()
  const [asOf, setAsOf] = useState(currentMonthKey())

  const entries = useMemo(() => buildMonthlyJournalEntries(rows, asOf), [rows, asOf])

  const totalDebit = useMemo(
    () => entries.reduce((sum, r) => sum + (r.debit ?? 0), 0),
    [entries],
  )
  const totalCredit = useMemo(
    () => entries.reduce((sum, r) => sum + (r.credit ?? 0), 0),
    [entries],
  )

  const handleExport = (format: ExportFormat) => {
    if (entries.length === 0) {
      toast({ title: 'Nothing to export', description: 'No journal entries for that month.' })
      return
    }
    const data = entries.map((r) => ({
      Date: r.date,
      Contract: r.contractName,
      Type: r.subtype,
      Account: r.account,
      Debit: r.debit ?? '',
      Credit: r.credit ?? '',
      Memo: r.memo,
    }))
    exportRows(data, format, `Waterfall_JEs_${asOf}`, 'Journal Entries').catch(() =>
      toast({ title: 'Export failed', variant: 'destructive' }),
    )
  }

  const columns: ColumnDef<MonthlyJournalRow>[] = [
    { header: 'Date', accessorKey: 'date', sortable: true },
    {
      header: 'Contract',
      accessorKey: 'contractName',
      sortable: true,
      cell: (_v, row) => (
        <div className="min-w-0">
          <div className="font-medium text-foreground">{row.contractName}</div>
          <Badge variant="secondary" className="mt-0.5">
            {row.subtype}
          </Badge>
        </div>
      ),
    },
    { header: 'Account', accessorKey: 'account', sortable: true },
    {
      header: 'Debit',
      accessorKey: 'debit',
      cell: (value) =>
        value == null ? (
          <span className="text-foreground-subtle">—</span>
        ) : (
          <span className="tabular-nums">{formatCurrency(value as number)}</span>
        ),
    },
    {
      header: 'Credit',
      accessorKey: 'credit',
      cell: (value) =>
        value == null ? (
          <span className="text-foreground-subtle">—</span>
        ) : (
          <span className="tabular-nums">{formatCurrency(value as number)}</span>
        ),
    },
    { header: 'Memo', accessorKey: 'memo' },
  ]

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="mr-1.5 size-4" aria-hidden /> Back to schedules
      </Button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <Label htmlFor="wf-je-month">Month</Label>
          <Input
            id="wf-je-month"
            type="month"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="w-44"
          />
        </div>
        {entries.length > 0 && (
          <div className="flex flex-wrap items-center gap-4 text-sm text-foreground-muted">
            <span>
              <span className="font-medium text-foreground">{entries.length}</span> line
              {entries.length === 1 ? '' : 's'}
            </span>
            <span>
              Debits{' '}
              <span className="font-semibold tabular-nums text-foreground">
                {formatCurrency(totalDebit)}
              </span>
            </span>
            <span>
              Credits{' '}
              <span className="font-semibold tabular-nums text-foreground">
                {formatCurrency(totalCredit)}
              </span>
            </span>
          </div>
        )}
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No entries for this month"
          description="No saved schedule recognizes anything in the selected month. Pick another month or create a schedule that covers it."
        />
      ) : (
        <DataTable
          data={entries}
          columns={columns}
          searchPlaceholder="Search journal entries…"
          actions={<ExportButton onExport={handleExport} />}
        />
      )}
    </div>
  )
}

export default WaterfallMonthlyJournal
