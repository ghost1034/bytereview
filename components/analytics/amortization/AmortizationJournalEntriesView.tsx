'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { ExportButton, type ExportFormat } from '@/components/analytics/ExportButton'
import {
  buildDisposalJournalLines,
  deriveJournalLines,
} from '@/lib/analytics/amortizationHelpers'
import { exportRows } from '@/lib/analytics/exportData'
import { formatCurrency } from '@/lib/analytics/format'
import {
  DEFAULT_ACCOUNTS,
  type JournalLine,
  type ScheduleRow,
} from '@/lib/analytics/amortizationTypes'
import type { AnalyticsAmortization, AnalyticsClient } from '@/lib/analytics/types'

interface AmortizationJournalEntriesViewProps {
  rows: AnalyticsAmortization[]
  clients: AnalyticsClient[]
  onBack: () => void
}

const currentMonth = () => new Date().toISOString().slice(0, 7)

/**
 * Period-end Journal Entries view: pick a month, get the consolidated set of
 * journal lines across every asset whose schedule includes that month, plus
 * the 4-line disposal entry for any asset disposed that month.
 */
export function AmortizationJournalEntriesView({
  rows,
  clients,
  onBack,
}: AmortizationJournalEntriesViewProps) {
  const { toast } = useToast()
  const [month, setMonth] = useState<string>(currentMonth())

  const clientNameById = useMemo(
    () => new Map(clients.map((c) => [c.id, c.name])),
    [clients],
  )

  const lines = useMemo<JournalLine[]>(() => {
    const out: JournalLine[] = []
    for (const asset of rows) {
      const ts = (asset.type_specific ?? {}) as Record<string, unknown>
      const schedule = (asset.schedule ?? []) as unknown as ScheduleRow[]
      const matching = schedule.filter(
        (s) => typeof s.date === 'string' && s.date.slice(0, 7) === month,
      )
      for (const row of matching) {
        const formLike = {
          assetName: asset.asset_name,
          expenseAccount:
            (ts.expenseAccount as string) || DEFAULT_ACCOUNTS.expenseAccount,
          accumulatedAccount:
            (ts.accumulatedAccount as string) || DEFAULT_ACCOUNTS.accumulatedAccount,
        }
        out.push(...deriveJournalLines(row, formLike))
      }

      // Disposal entry: only emit on the actual disposal month.
      const disposalDate = ts.disposalDate as string | undefined
      if (
        (asset.status ?? '').toLowerCase() === 'disposed' &&
        disposalDate &&
        disposalDate.slice(0, 7) === month
      ) {
        const cost = asset.cost_basis ?? 0
        const accumDepr = (ts.disposalAccumDepr as number) ?? 0
        const saleProceeds = (ts.saleProceeds as number) ?? 0
        const gainLoss = (ts.gaapGainLoss as number) ?? 0
        out.push(
          ...buildDisposalJournalLines({
            assetName: asset.asset_name,
            date: disposalDate,
            cost,
            accumDepr,
            saleProceeds,
            gainLoss,
            clearingAccount:
              (ts.clearingAccount as string) || DEFAULT_ACCOUNTS.clearingAccount,
            accumulatedAccount:
              (ts.accumulatedAccount as string) || DEFAULT_ACCOUNTS.accumulatedAccount,
            assetAccount: (ts.assetAccount as string) || DEFAULT_ACCOUNTS.assetAccount,
            gainLossAccount:
              (ts.gainLossAccount as string) || DEFAULT_ACCOUNTS.gainLossAccount,
          }),
        )
      }
    }
    return out
  }, [rows, month])

  const handleExport = (format: ExportFormat) => {
    if (lines.length === 0) {
      toast({ title: 'Nothing to export', description: 'No journal entries for this month.' })
      return
    }
    const data = lines.map((l) => ({
      Date: l.date,
      Account: l.account,
      Memo: l.memo,
      Debit: l.debit ?? '',
      Credit: l.credit ?? '',
    }))
    exportRows(data, format, `Amortization_Journal_Entries_${month}`, 'Journal').catch(() =>
      toast({ title: 'Export failed', variant: 'destructive' }),
    )
  }

  // Surface unused dependency so a future enhancement that filters by client
  // doesn't have to re-thread the prop.
  void clientNameById

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="mr-1.5 size-4" aria-hidden /> Back to portfolio
      </Button>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <Label htmlFor="amort-je-month">Period</Label>
          <Input
            id="amort-je-month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-44"
          />
        </div>
        <ExportButton onExport={handleExport} />
      </div>

      {lines.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center text-sm text-foreground-muted">
          No journal entries for {month}. Pick another period or generate schedules first.
        </div>
      ) : (
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
              {lines.map((line) => (
                <tr key={line.id} className="hover:bg-surface-muted/50">
                  <td className="whitespace-nowrap p-3 text-left text-foreground-muted">
                    {line.date}
                  </td>
                  <td className="p-3 text-left font-medium text-foreground">{line.account}</td>
                  <td className="p-3 text-right tabular-nums text-foreground">
                    {line.debit != null ? formatCurrency(line.debit) : ''}
                  </td>
                  <td className="p-3 text-right tabular-nums text-foreground">
                    {line.credit != null ? formatCurrency(line.credit) : ''}
                  </td>
                  <td className="p-3 text-left text-foreground-muted">{line.memo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default AmortizationJournalEntriesView
