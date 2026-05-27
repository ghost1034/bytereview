'use client'

import { useMemo, useState } from 'react'
import { FileText, Loader2, Pencil, Plus, Scissors, Trash2, Upload } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StatCard } from '@/components/ui/stat-card'
import { DataTable, type ColumnDef } from '@/components/analytics/DataTable'
import { ExportButton, type ExportFormat } from '@/components/analytics/ExportButton'
import { useDeleteAnalyticsWaterfall } from '@/hooks/useAnalyticsWaterfall'
import { useToast } from '@/hooks/use-toast'
import { exportRows } from '@/lib/analytics/exportData'
import { formatCurrency } from '@/lib/analytics/format'
import type { WaterfallRollup } from '@/lib/analytics/waterfallData'
import { WATERFALL_SUBTYPES, type WaterfallSubtype } from '@/lib/analytics/waterfallTypes'
import type { AnalyticsClient } from '@/lib/analytics/types'

const ALL_CLIENTS = '__all__'

interface WaterfallListProps {
  rows: WaterfallRollup[]
  clients: AnalyticsClient[]
  asOf: string
  onAsOfChange: (month: string) => void
  clientFilter: string | null
  onClientFilterChange: (clientId: string | null) => void
  onNew: () => void
  onBulk: () => void
  onReports: () => void
  onEdit: (row: WaterfallRollup) => void
  onWriteOff: (row: WaterfallRollup) => void
}

export function WaterfallList({
  rows,
  clients,
  asOf,
  onAsOfChange,
  clientFilter,
  onClientFilterChange,
  onNew,
  onBulk,
  onReports,
  onEdit,
  onWriteOff,
}: WaterfallListProps) {
  const { toast } = useToast()
  const deleteMutation = useDeleteAnalyticsWaterfall()
  const [toDelete, setToDelete] = useState<WaterfallRollup | null>(null)

  const clientNameById = useMemo(
    () => new Map(clients.map((c) => [c.id, c.name])),
    [clients],
  )

  // Per-subtype rollup for the metric cards.
  const metrics = useMemo(() => {
    const acc: Record<WaterfallSubtype, { count: number; balance: number }> = {
      'Deferred Revenue': { count: 0, balance: 0 },
      'Prepaid Expenses': { count: 0, balance: 0 },
      'Accrued Expenses': { count: 0, balance: 0 },
      'Deferred Commission': { count: 0, balance: 0 },
    }
    for (const r of rows) {
      acc[r.subtype].count += 1
      acc[r.subtype].balance += r.currentBalance
    }
    return acc
  }, [rows])

  const confirmDelete = async () => {
    if (!toDelete) return
    try {
      await deleteMutation.mutateAsync(toDelete.id)
      toast({ title: 'Schedule deleted', description: `${toDelete.name} has been removed.` })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete schedule.',
        variant: 'destructive',
      })
    } finally {
      setToDelete(null)
    }
  }

  const handleExport = (format: ExportFormat) => {
    if (rows.length === 0) {
      toast({ title: 'Nothing to export', description: 'Create a schedule first.' })
      return
    }
    const data = rows.map((r) => ({
      Name: r.name,
      Type: r.subtype,
      Party: r.form.partyName,
      Client: r.clientId ? clientNameById.get(r.clientId) ?? '' : '',
      'Start Date': r.form.startDate,
      'End Date': r.form.endDate,
      'Total Amount': r.form.totalAmount,
      'Recognized to Date': r.recognizedToDate,
      'Current Balance': r.currentBalance,
    }))
    exportRows(data, format, 'Waterfall_Schedules', 'Waterfall').catch(() =>
      toast({ title: 'Export failed', variant: 'destructive' }),
    )
  }

  const columns: ColumnDef<WaterfallRollup>[] = [
    {
      header: 'Name',
      accessorKey: 'name',
      sortable: true,
      cell: (_v, row) => (
        <div className="min-w-0">
          <div className="font-semibold text-foreground">{row.name}</div>
          {row.form.partyName && (
            <div className="line-clamp-1 text-xs text-foreground-muted">{row.form.partyName}</div>
          )}
        </div>
      ),
    },
    {
      header: 'Type',
      accessorKey: 'subtype',
      sortable: true,
      cell: (value) => <Badge variant="secondary">{value as string}</Badge>,
    },
    {
      header: 'Client',
      accessorKey: 'clientId',
      cell: (value) =>
        (value && clientNameById.get(value as string)) || (
          <span className="text-foreground-subtle">—</span>
        ),
    },
    {
      header: 'Period',
      accessorKey: 'id',
      cell: (_v, row) => (
        <span className="whitespace-nowrap text-foreground-muted">
          {row.form.startDate} → {row.form.endDate}
        </span>
      ),
    },
    {
      header: 'Total',
      accessorKey: 'id',
      cell: (_v, row) => <span className="tabular-nums">{formatCurrency(row.form.totalAmount)}</span>,
    },
    {
      header: 'Recognized',
      accessorKey: 'recognizedToDate',
      cell: (value) => <span className="tabular-nums">{formatCurrency(value as number)}</span>,
    },
    {
      header: 'Current balance',
      accessorKey: 'currentBalance',
      cell: (value) => (
        <span className="font-semibold tabular-nums text-foreground">
          {formatCurrency(value as number)}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="wf-asof">As of</Label>
            <Input
              id="wf-asof"
              type="month"
              value={asOf}
              onChange={(e) => onAsOfChange(e.target.value)}
              className="w-44"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wf-client-filter">Client</Label>
            <Select
              value={clientFilter ?? ALL_CLIENTS}
              onValueChange={(v) => onClientFilterChange(v === ALL_CLIENTS ? null : v)}
            >
              <SelectTrigger id="wf-client-filter" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CLIENTS}>All clients</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={onReports}>
            <FileText className="mr-1.5 size-4" aria-hidden /> Reports
          </Button>
          <Button variant="outline" onClick={onBulk}>
            <Upload className="mr-1.5 size-4" aria-hidden /> Bulk upload
          </Button>
          <Button onClick={onNew}>
            <Plus className="mr-1.5 size-4" aria-hidden /> New schedule
          </Button>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {WATERFALL_SUBTYPES.map((subtype) => (
          <StatCard
            key={subtype}
            label={subtype}
            value={formatCurrency(metrics[subtype].balance)}
            hint={`${metrics[subtype].count} schedule${metrics[subtype].count === 1 ? '' : 's'}`}
          />
        ))}
      </div>

      {/* Consolidated matrix */}
      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Search schedules…"
        actions={<ExportButton onExport={handleExport} />}
        rowActions={(row) => (
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon" aria-label={`Edit ${row.name}`} onClick={() => onEdit(row)}>
              <Pencil className="size-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Write off ${row.name}`}
              onClick={() => onWriteOff(row)}
            >
              <Scissors className="size-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${row.name}`}
              onClick={() => setToDelete(row)}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        )}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete schedule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{toDelete?.name}&rdquo;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Deleting…
                </>
              ) : (
                'Delete schedule'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default WaterfallList
