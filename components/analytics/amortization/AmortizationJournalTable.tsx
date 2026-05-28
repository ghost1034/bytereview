'use client'

import { useMemo, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import {
  useAnalyticsJournalEntries,
  useCreateAnalyticsJournalEntry,
} from '@/hooks/useAnalyticsAmortization'
import {
  deriveJournalLines,
} from '@/lib/analytics/amortizationHelpers'
import { formatCurrency } from '@/lib/analytics/format'
import type {
  AmortizationForm,
  JournalLine,
  ScheduleRow,
} from '@/lib/analytics/amortizationTypes'

interface AmortizationJournalTableProps {
  /** Schedule used to derive journal lines client-side (preview before save). */
  schedule: ScheduleRow[]
  form: Pick<AmortizationForm, 'assetName' | 'expenseAccount' | 'accumulatedAccount'>
  /** When set, the "Save JE for period" picker persists via the API. */
  amortizationId?: string
  clientId?: string | null
}

/**
 * Render derived double-entry lines for a schedule, optionally with a control
 * to persist a single period's entry to the journal_entries table.
 */
export function AmortizationJournalTable({
  schedule,
  form,
  amortizationId,
  clientId,
}: AmortizationJournalTableProps) {
  const { toast } = useToast()
  const createMutation = useCreateAnalyticsJournalEntry()
  const { data: savedData } = useAnalyticsJournalEntries(amortizationId)

  const [selectedPeriod, setSelectedPeriod] = useState<string>('')

  const linesByPeriod = useMemo(() => {
    const map = new Map<number, { date: string; lines: JournalLine[] }>()
    for (const row of schedule) {
      const lines = deriveJournalLines(row, form)
      if (lines.length === 0) continue
      map.set(row.period, { date: row.date, lines })
    }
    return map
  }, [schedule, form])

  const allLines = useMemo<JournalLine[]>(() => {
    const out: JournalLine[] = []
    for (const { lines } of linesByPeriod.values()) out.push(...lines)
    return out
  }, [linesByPeriod])

  const handleSave = async () => {
    if (!amortizationId) return
    const period = Number(selectedPeriod)
    const entry = linesByPeriod.get(period)
    if (!entry) {
      toast({ title: 'Pick a period', description: 'Select a period to record.', variant: 'destructive' })
      return
    }
    try {
      await createMutation.mutateAsync({
        amortization_id: amortizationId,
        client_id: clientId ?? null,
        period: entry.date.slice(0, 7), // YYYY-MM
        entries: entry.lines.map((l) => ({
          account: l.account,
          debit: l.debit,
          credit: l.credit,
          memo: l.memo,
        })),
      })
      toast({
        title: 'Journal entry recorded',
        description: `Period ${entry.date.slice(0, 7)} saved.`,
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save journal entry.',
        variant: 'destructive',
      })
    }
  }

  if (allLines.length === 0) {
    return (
      <p className="px-1 py-8 text-center text-sm text-foreground-muted">
        Journal entries will appear here once a schedule is generated.
      </p>
    )
  }

  const savedCount = savedData?.journal_entries?.length ?? 0
  const periodOptions = Array.from(linesByPeriod.entries()).map(([period, { date }]) => ({
    period: String(period),
    label: `Period ${period} (${date.slice(0, 7)})`,
  }))

  return (
    <div className="space-y-3">
      {amortizationId && (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-foreground">Save journal entry</span>
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Pick a period…" />
              </SelectTrigger>
              <SelectContent>
                {periodOptions.map((opt) => (
                  <SelectItem key={opt.period} value={opt.period}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {savedCount > 0 && (
              <span className="text-xs text-foreground-muted">
                {savedCount} entr{savedCount === 1 ? 'y' : 'ies'} saved
              </span>
            )}
          </div>
          <Button onClick={handleSave} disabled={!selectedPeriod || createMutation.isPending} size="sm">
            {createMutation.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="mr-1.5 size-4" aria-hidden />
            )}
            Record
          </Button>
        </div>
      )}

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
            {allLines.map((line) => (
              <tr key={line.id} className="hover:bg-surface-muted/50">
                <td className="whitespace-nowrap p-3 text-left text-foreground-muted">{line.date}</td>
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
    </div>
  )
}

export default AmortizationJournalTable
