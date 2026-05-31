'use client'

import { useMemo } from 'react'
import { AlertTriangle, Check, MessageSquare, Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { DataTable, type ColumnDef } from '@/components/analytics/DataTable'
import { formatCurrency } from '@/lib/analytics/format'
import { requiresVarianceExplanation } from '@/lib/analytics/varianceHelpers'
import type { VarianceData } from '@/lib/analytics/varianceTypes'

interface VarianceTableProps {
  rows: VarianceData[]
  onRowClick?: (row: VarianceData) => void
}

const STATUS_VARIANT: Record<
  VarianceData['status'],
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  Pending: 'secondary',
  Accepted: 'default',
  Edited: 'outline',
  Rejected: 'destructive',
}

export function VarianceTable({ rows, onRowClick }: VarianceTableProps) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => b.absVariance - a.absVariance),
    [rows],
  )

  const columns: ColumnDef<VarianceData>[] = [
    {
      header: 'Account',
      accessorKey: 'accountName',
      sortable: true,
      cell: (_v, row) => (
        <div className="flex items-center gap-2">
          {row.isFlagged && (
            <AlertTriangle
              className="size-4 text-destructive"
              aria-label="Flagged"
            />
          )}
          <span className="font-medium text-foreground">{row.accountName}</span>
        </div>
      ),
    },
    {
      header: 'Department',
      accessorKey: 'department',
      cell: (value) =>
        value ? <span className="text-foreground-muted">{value as string}</span> : '—',
    },
    {
      header: 'Base',
      accessorKey: 'baseAmount',
      sortable: true,
      cell: (value) => (
        <span className="tabular-nums">{formatCurrency(value as number)}</span>
      ),
    },
    {
      header: 'Comparison',
      accessorKey: 'compAmount',
      sortable: true,
      cell: (value) => (
        <span className="tabular-nums">{formatCurrency(value as number)}</span>
      ),
    },
    {
      header: 'Variance',
      accessorKey: 'variance',
      sortable: true,
      cell: (_v, row) => (
        <span
          className={`tabular-nums ${
            row.isFavorable === true
              ? 'text-emerald-600 dark:text-emerald-400'
              : row.isFavorable === false
                ? 'text-destructive'
                : 'text-foreground'
          }`}
        >
          {formatCurrency(row.variance)}
        </span>
      ),
    },
    {
      header: 'Variance %',
      accessorKey: 'variancePercent',
      sortable: true,
      cell: (_v, row) =>
        row.variancePercent === 'N/M' ? (
          <span className="text-foreground-subtle">N/M</span>
        ) : (
          <span className="tabular-nums">{(row.variancePercent as number).toFixed(1)}%</span>
        ),
    },
    {
      header: 'Confidence',
      accessorKey: 'confidence',
      cell: (value) =>
        value ? (
          <Badge variant="outline" className="text-xs">
            {value as string}
          </Badge>
        ) : (
          <span className="text-foreground-subtle">—</span>
        ),
    },
    {
      header: 'Status',
      accessorKey: 'status',
      cell: (_v, row) => {
        const hasExplanation = !!row.explanation
        if (!requiresVarianceExplanation(row)) {
          return (
            <span className="text-xs text-foreground-subtle">Below threshold</span>
          )
        }
        return (
          <div className="flex items-center gap-1.5">
            <Badge variant={STATUS_VARIANT[row.status]} className="text-xs">
              {row.status === 'Accepted' && <Check className="mr-1 size-3" />}
              {row.status}
            </Badge>
            {hasExplanation && (
              <Sparkles
                className="size-3.5 text-primary"
                aria-label="Has AI explanation"
              />
            )}
            {row.customAttributes && Object.keys(row.customAttributes).length > 0 && (
              <MessageSquare
                className="size-3.5 text-foreground-subtle"
                aria-label="Has notes"
              />
            )}
          </div>
        )
      },
    },
  ]

  return (
    <DataTable
      data={sorted}
      columns={columns}
      onRowClick={onRowClick}
      searchPlaceholder="Search variances by account, department…"
      pageSize={20}
    />
  )
}

export default VarianceTable
