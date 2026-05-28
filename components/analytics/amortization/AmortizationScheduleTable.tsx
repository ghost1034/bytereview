'use client'

import { formatCurrency } from '@/lib/analytics/format'
import type { ScheduleRow, ScheduleMethodKey } from '@/lib/analytics/amortizationTypes'

interface AmortizationScheduleTableProps {
  schedule: ScheduleRow[]
  /** Hint that drives which columns are rendered. Auto-detected if omitted. */
  method?: ScheduleMethodKey
  /** Optional label shown above the table (e.g. "GAAP schedule"). */
  label?: string
}

type ColumnShape = 'standard' | 'loan' | 'lease' | 'macrs'

function detectShape(schedule: ScheduleRow[], method?: ScheduleMethodKey): ColumnShape {
  if (method) {
    if (method === 'loan') return 'loan'
    if (method === 'operating_lease' || method === 'finance_lease') return 'lease'
    if (method === 'macrs') return 'macrs'
    return 'standard'
  }
  const first = schedule[0]
  if (!first) return 'standard'
  if (typeof first.totalExpense === 'number') return 'lease'
  if (typeof first.payment === 'number' && typeof first.interest === 'number') return 'loan'
  if (typeof first.rate === 'number' && typeof first.basis === 'number') return 'macrs'
  return 'standard'
}

const headerByShape: Record<ColumnShape, string[]> = {
  standard: ['Period', 'Date', 'Opening', 'Expense', 'Closing'],
  loan: ['Period', 'Date', 'Payment', 'Interest', 'Principal', 'Balance'],
  lease: ['Period', 'Date', 'SL Expense', 'Interest', 'Total Expense', 'Liability', 'ROU'],
  macrs: ['Year', 'Date', 'Rate', 'Expense', 'Accumulated', 'Basis'],
}

/** Period-by-period amortization schedule. Presentational; column set adapts to the source method. */
export function AmortizationScheduleTable({
  schedule,
  method,
  label,
}: AmortizationScheduleTableProps) {
  if (schedule.length === 0) {
    return (
      <p className="px-1 py-8 text-center text-sm text-foreground-muted">
        Generate a schedule above and the period-by-period detail will appear here.
      </p>
    )
  }

  const shape = detectShape(schedule, method)
  const headers = headerByShape[shape]

  return (
    <div className="space-y-2">
      {label && (
        <h4 className="text-xs font-bold uppercase tracking-widest text-foreground-muted">
          {label}
        </h4>
      )}
      <div className="overflow-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-right text-sm">
          <thead className="sticky top-0 bg-surface-muted">
            <tr className="text-xs font-bold uppercase tracking-widest text-foreground-muted">
              {headers.map((h, i) => (
                <th key={h} className={i === 0 ? 'p-3 text-left' : 'p-3'}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border tabular-nums">
            {schedule.map((row, idx) => (
              <tr key={`${row.period}-${row.date}-${idx}`} className="hover:bg-surface-muted/50">
                <td className="p-3 text-left font-medium text-foreground">{row.period}</td>
                <td className="p-3 text-foreground-muted">{row.date}</td>
                {shape === 'standard' && (
                  <>
                    <td className="p-3 text-foreground-muted">{formatCurrency(row.openingBalance)}</td>
                    <td className="p-3 font-semibold text-foreground">{formatCurrency(row.expense)}</td>
                    <td className="p-3 text-foreground-muted">{formatCurrency(row.closingBalance)}</td>
                  </>
                )}
                {shape === 'loan' && (
                  <>
                    <td className="p-3 text-foreground-muted">{formatCurrency(row.payment)}</td>
                    <td className="p-3 text-foreground-muted">{formatCurrency(row.interest)}</td>
                    <td className="p-3 text-foreground-muted">{formatCurrency(row.principal)}</td>
                    <td className="p-3 font-semibold text-foreground">
                      {formatCurrency(
                        typeof row.closingBalance === 'number' ? row.closingBalance : row.liabBalance,
                      )}
                    </td>
                  </>
                )}
                {shape === 'lease' && (
                  <>
                    <td className="p-3 text-foreground-muted">{formatCurrency(row.slExpense)}</td>
                    <td className="p-3 text-foreground-muted">{formatCurrency(row.interestExpense)}</td>
                    <td className="p-3 font-semibold text-foreground">
                      {formatCurrency(row.totalExpense)}
                    </td>
                    <td className="p-3 text-foreground-muted">
                      {formatCurrency(
                        typeof row.liabClosing === 'number' ? row.liabClosing : row.liabBalance,
                      )}
                    </td>
                    <td className="p-3 text-foreground-muted">
                      {formatCurrency(
                        typeof row.rouClosing === 'number' ? row.rouClosing : row.closingBalance,
                      )}
                    </td>
                  </>
                )}
                {shape === 'macrs' && (
                  <>
                    <td className="p-3 text-foreground-muted">
                      {typeof row.rate === 'number' ? `${(row.rate * 100).toFixed(2)}%` : '—'}
                    </td>
                    <td className="p-3 font-semibold text-foreground">{formatCurrency(row.expense)}</td>
                    <td className="p-3 text-foreground-muted">{formatCurrency(row.accumulated)}</td>
                    <td className="p-3 text-foreground-muted">{formatCurrency(row.basis)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default AmortizationScheduleTable
