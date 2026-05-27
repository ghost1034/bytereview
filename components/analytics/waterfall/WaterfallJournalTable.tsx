'use client'

import { formatCurrency } from '@/lib/analytics/format'
import type { JournalEntry } from '@/lib/analytics/waterfallTypes'

interface WaterfallJournalTableProps {
  journalEntries: JournalEntry[]
}

/** Double-entry journal entries generated alongside the schedule. */
export function WaterfallJournalTable({ journalEntries }: WaterfallJournalTableProps) {
  if (journalEntries.length === 0) {
    return (
      <p className="px-1 py-8 text-center text-sm text-foreground-muted">
        Journal entries will appear here once a schedule is generated.
      </p>
    )
  }

  return (
    <div className="overflow-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-surface-muted">
          <tr className="text-xs font-bold uppercase tracking-widest text-foreground-muted">
            <th className="p-3 text-left">Date</th>
            <th className="p-3 text-left">Account</th>
            <th className="p-3 text-right">Debit</th>
            <th className="p-3 text-right">Credit</th>
            <th className="p-3 text-left">Memo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {journalEntries.map((je) => (
            <tr key={je.id} className="hover:bg-surface-muted/50">
              <td className="whitespace-nowrap p-3 text-left text-foreground-muted">{je.date}</td>
              <td className="p-3 text-left font-medium text-foreground">{je.account}</td>
              <td className="p-3 text-right tabular-nums text-foreground">
                {je.debit != null ? formatCurrency(je.debit) : ''}
              </td>
              <td className="p-3 text-right tabular-nums text-foreground">
                {je.credit != null ? formatCurrency(je.credit) : ''}
              </td>
              <td className="p-3 text-left text-foreground-muted">{je.memo}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default WaterfallJournalTable
