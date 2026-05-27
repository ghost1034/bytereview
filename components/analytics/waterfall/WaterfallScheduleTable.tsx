'use client'

import { formatCurrency } from '@/lib/analytics/format'
import type { ScheduleRow } from '@/lib/analytics/waterfallTypes'

interface WaterfallScheduleTableProps {
  schedule: ScheduleRow[]
}

/** Period-by-period recognition schedule. Presentational only. */
export function WaterfallScheduleTable({ schedule }: WaterfallScheduleTableProps) {
  if (schedule.length === 0) {
    return (
      <p className="px-1 py-8 text-center text-sm text-foreground-muted">
        Fill in the details and the recognition schedule will appear here.
      </p>
    )
  }

  return (
    <div className="overflow-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-right text-sm">
        <thead className="sticky top-0 bg-surface-muted">
          <tr className="text-xs font-bold uppercase tracking-widest text-foreground-muted">
            <th className="p-3 text-left">Period</th>
            <th className="p-3">Opening</th>
            <th className="p-3">Recognized</th>
            <th className="p-3">Closing</th>
            <th className="p-3">Cumulative</th>
            <th className="p-3">Remaining</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border tabular-nums">
          {schedule.map((row) => (
            <tr key={row.id} className="hover:bg-surface-muted/50">
              <td className="p-3 text-left font-medium text-foreground">{row.period}</td>
              <td className="p-3 text-foreground-muted">{formatCurrency(row.opening)}</td>
              <td className="p-3 font-semibold text-foreground">{formatCurrency(row.recognized)}</td>
              <td className="p-3 text-foreground-muted">{formatCurrency(row.closing)}</td>
              <td className="p-3 text-foreground-muted">{formatCurrency(row.cumulative)}</td>
              <td className="p-3 text-foreground-muted">{formatCurrency(row.remaining)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default WaterfallScheduleTable
