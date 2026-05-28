'use client'

import { useMemo, useState } from 'react'
import {
  BookOpen,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Scissors,
  Trash2,
  Upload,
} from 'lucide-react'

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
import { useDeleteAnalyticsAmortization } from '@/hooks/useAnalyticsAmortization'
import { useToast } from '@/hooks/use-toast'
import { computeNbv, summarizePortfolio } from '@/lib/analytics/amortizationHelpers'
import { exportRows } from '@/lib/analytics/exportData'
import { formatCurrency } from '@/lib/analytics/format'
import type { AnalyticsAmortization, AnalyticsClient } from '@/lib/analytics/types'

const ALL_CLIENTS = '__all__'

interface AmortizationListProps {
  rows: AnalyticsAmortization[]
  clients: AnalyticsClient[]
  clientFilter: string | null
  onClientFilterChange: (clientId: string | null) => void
  onNew: () => void
  onBulk: () => void
  onReports: () => void
  onJournal: () => void
  onEdit: (row: AnalyticsAmortization) => void
  onDispose: (row: AnalyticsAmortization) => void
}

export function AmortizationList({
  rows,
  clients,
  clientFilter,
  onClientFilterChange,
  onNew,
  onBulk,
  onReports,
  onJournal,
  onEdit,
  onDispose,
}: AmortizationListProps) {
  const { toast } = useToast()
  const deleteMutation = useDeleteAnalyticsAmortization()
  const [toDelete, setToDelete] = useState<AnalyticsAmortization | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<(string | number)[]>([])
  const [asOfDate, setAsOfDate] = useState<string>(() => new Date().toISOString().slice(0, 10))

  const clientNameById = useMemo(
    () => new Map(clients.map((c) => [c.id, c.name])),
    [clients],
  )

  const summary = useMemo(() => summarizePortfolio(rows, asOfDate), [rows, asOfDate])
  const activeCount = useMemo(
    () => rows.filter((r) => (r.status ?? '').toLowerCase() !== 'disposed').length,
    [rows],
  )

  const confirmDelete = async () => {
    if (!toDelete) return
    try {
      await deleteMutation.mutateAsync(toDelete.id)
      toast({ title: 'Asset deleted', description: `${toDelete.asset_name} has been removed.` })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete asset.',
        variant: 'destructive',
      })
    } finally {
      setToDelete(null)
    }
  }

  const confirmBulkDelete = async () => {
    if (selectedIds.length === 0) return
    const ids = selectedIds.map(String)
    const results = await Promise.allSettled(
      ids.map((id) => deleteMutation.mutateAsync(id)),
    )
    const ok = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.length - ok
    setSelectedIds([])
    setBulkDeleteOpen(false)
    toast({
      title: failed ? 'Some deletes failed' : 'Assets deleted',
      description: `${ok} removed${failed ? `, ${failed} failed` : ''}.`,
      variant: failed && !ok ? 'destructive' : undefined,
    })
  }

  const handleExport = (format: ExportFormat) => {
    if (rows.length === 0) {
      toast({ title: 'Nothing to export', description: 'Add an asset first.' })
      return
    }
    const data = rows.map((r) => ({
      'Asset Name': r.asset_name,
      'Asset Type': r.asset_type,
      Client: r.client_id ? clientNameById.get(r.client_id) ?? '' : '',
      'Cost Basis': r.cost_basis ?? 0,
      NBV: computeNbv(r, asOfDate),
      'Useful Life (Months)': r.useful_life_months ?? 0,
      'GAAP Method': r.gaap_method ?? '',
      'Tax Method': r.tax_method ?? '',
      'Start Date': r.start_date ?? '',
      Vendor: r.vendor ?? '',
      Status: r.status ?? '',
      Approval: r.approval_status ?? '',
    }))
    exportRows(data, format, 'Amortization_Portfolio', 'Portfolio').catch(() =>
      toast({ title: 'Export failed', variant: 'destructive' }),
    )
  }

  const columns: ColumnDef<AnalyticsAmortization>[] = [
    {
      header: 'Asset',
      accessorKey: 'asset_name',
      sortable: true,
      cell: (_v, row) => (
        <div className="min-w-0">
          <div className="font-semibold text-foreground">{row.asset_name}</div>
          {row.vendor && (
            <div className="line-clamp-1 text-xs text-foreground-muted">{row.vendor}</div>
          )}
        </div>
      ),
    },
    {
      header: 'Type',
      accessorKey: 'asset_type',
      sortable: true,
      cell: (value) => <Badge variant="secondary">{value as string}</Badge>,
    },
    {
      header: 'Client',
      accessorKey: 'client_id',
      cell: (value) =>
        (value && clientNameById.get(value as string)) || (
          <span className="text-foreground-subtle">—</span>
        ),
    },
    {
      header: 'Cost basis',
      accessorKey: 'cost_basis',
      sortable: true,
      cell: (value) => <span className="tabular-nums">{formatCurrency(value as number)}</span>,
    },
    {
      header: 'NBV',
      accessorKey: 'id',
      cell: (_v, row) => (
        <span className="font-semibold tabular-nums text-foreground">
          {formatCurrency(computeNbv(row, asOfDate))}
        </span>
      ),
    },
    {
      header: 'GAAP / Tax',
      accessorKey: 'gaap_method',
      cell: (_v, row) => (
        <div className="whitespace-nowrap text-xs text-foreground-muted">
          {row.gaap_method ?? '—'} / {row.tax_method ?? '—'}
        </div>
      ),
    },
    {
      header: 'Start',
      accessorKey: 'start_date',
      sortable: true,
      cell: (value) =>
        value ? (
          <span className="whitespace-nowrap text-foreground-muted">{value as string}</span>
        ) : (
          <span className="text-foreground-subtle">—</span>
        ),
    },
    {
      header: 'Status',
      accessorKey: 'status',
      sortable: true,
      cell: (value, row) => {
        const status = (value as string) ?? 'draft'
        const isDisposed = status.toLowerCase() === 'disposed'
        return (
          <div className="flex flex-col gap-1">
            <Badge variant={isDisposed ? 'destructive' : 'outline'}>{status}</Badge>
            {row.approval_status && (
              <span className="text-[10px] uppercase tracking-wider text-foreground-subtle">
                {row.approval_status}
              </span>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="amort-client-filter">Client</Label>
            <Select
              value={clientFilter ?? ALL_CLIENTS}
              onValueChange={(v) => onClientFilterChange(v === ALL_CLIENTS ? null : v)}
            >
              <SelectTrigger id="amort-client-filter" className="w-56">
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
          <div className="space-y-1.5">
            <Label htmlFor="amort-as-of">As of</Label>
            <Input
              id="amort-as-of"
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="w-44"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={onJournal}>
            <BookOpen className="mr-1.5 size-4" aria-hidden /> Journal entries
          </Button>
          <Button variant="outline" onClick={onReports}>
            <FileText className="mr-1.5 size-4" aria-hidden /> Reports
          </Button>
          <Button variant="outline" onClick={onBulk}>
            <Upload className="mr-1.5 size-4" aria-hidden /> Bulk upload
          </Button>
          <Button onClick={onNew}>
            <Plus className="mr-1.5 size-4" aria-hidden /> New asset
          </Button>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Assets"
          value={rows.length}
          hint={`${activeCount} active`}
        />
        <StatCard
          label="Total cost basis"
          value={formatCurrency(summary.totalCostBasis)}
        />
        <StatCard
          label="Net book value"
          value={formatCurrency(summary.totalNbv)}
          hint={`As of ${asOfDate}`}
        />
        <StatCard
          label="Monthly expense"
          value={formatCurrency(summary.monthlyExpense)}
          hint="Current period"
        />
      </div>

      {/* Portfolio table */}
      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Search assets…"
        enableSelection
        selectedRows={selectedIds}
        onSelectionChange={setSelectedIds}
        actions={
          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkDeleteOpen(true)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="mr-1.5 size-4" aria-hidden /> Delete selected ({selectedIds.length})
              </Button>
            )}
            <ExportButton onExport={handleExport} />
          </div>
        }
        rowActions={(row) => {
          const isDisposed = (row.status ?? '').toLowerCase() === 'disposed'
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit ${row.asset_name}`}
                onClick={() => onEdit(row)}
              >
                <Pencil className="size-4" aria-hidden />
              </Button>
              {!isDisposed && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Dispose ${row.asset_name}`}
                  onClick={() => onDispose(row)}
                >
                  <Scissors className="size-4" aria-hidden />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${row.asset_name}`}
                onClick={() => setToDelete(row)}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          )
        }}
      />

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected assets</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.length} selected asset
              {selectedIds.length === 1 ? '' : 's'}? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Deleting…
                </>
              ) : (
                `Delete ${selectedIds.length}`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete asset</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{toDelete?.asset_name}&rdquo;? This cannot be undone.
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
                'Delete asset'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default AmortizationList
