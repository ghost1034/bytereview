'use client'

import { useMemo } from 'react'

import { formatCurrency } from '@/lib/analytics/format'
import type { ScheduleRow } from '@/lib/analytics/amortizationTypes'

interface Props {
  schedule: ScheduleRow[]
  taxSchedule: ScheduleRow[]
}

function gaapExpense(row: ScheduleRow | undefined): number {
  if (!row) return 0
  return (
    (typeof row.expense === 'number' && row.expense) ||
    (typeof row.totalExpense === 'number' && row.totalExpense) ||
    (typeof row.slExpense === 'number' && row.slExpense) ||
    (typeof row.principal === 'number' && row.principal) ||
    0
  )
}

function taxExpense(row: ScheduleRow | undefined): number {
  if (!row) return 0
  const totalDep = row['totalDep']
  if (typeof totalDep === 'number') return totalDep
  return (typeof row.expense === 'number' && row.expense) || 0
}

/**
 * Side-by-side GAAP vs Tax depreciation comparison. Iterates to the longer of
 * the two schedules and pairs row-by-row. Difference is color-coded.
 */
export function AmortizationScheduleComparisonTable({ schedule, taxSchedule }: Props) {
  const rows = useMemo(() => {
    const len = Math.max(schedule.length, taxSchedule.length)
    return Array.from({ length: len }, (_, i) => {
      const g = schedule[i]
      const t = taxSchedule[i]
      const gaap = gaapExpense(g)
      const tax = taxExpense(t)
      const label = String(g?.period ?? t?.['year'] ?? i + 1)
      return { id: i, label, gaap, tax, diff: gaap - tax }
    })
  }, [schedule, taxSchedule])

  if (rows.length === 0) {
    return (
      <p className="px-1 py-8 text-center text-sm text-foreground-muted">
        Generate both GAAP and Tax schedules to see the comparison.
      </p>
    )
  }

  return (
    <div className="overflow-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-surface-muted">
          <tr className="text-xs font-bold uppercase tracking-widest text-foreground-muted">
            <th className="p-3 text-left">Period / Year</th>
            <th className="p-3 text-right">GAAP Depreciation</th>
            <th className="p-3 text-right">Tax Depreciation</th>
            <th className="p-3 text-right">Difference (GAAP − Tax)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-surface-muted/50">
              <td className="p-3 text-left font-medium text-foreground">{r.label}</td>
              <td className="p-3 text-right tabular-nums text-foreground">
                {formatCurrency(r.gaap)}
              </td>
              <td className="p-3 text-right tabular-nums text-foreground">
                {formatCurrency(r.tax)}
              </td>
              <td
                className={`p-3 text-right tabular-nums font-semibold ${
                  r.diff > 0
                    ? 'text-success'
                    : r.diff < 0
                      ? 'text-destructive'
                      : 'text-foreground-muted'
                }`}
              >
                {formatCurrency(r.diff)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default AmortizationScheduleComparisonTable
