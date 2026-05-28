'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useManualMatchReconciliation } from '@/hooks/useAnalyticsReconciliation'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/analytics/format'
import type { ReconciliationTransaction } from '@/lib/analytics/reconciliationTypes'

interface ManualMatchDialogProps {
  open: boolean
  onClose: () => void
  reconciliationId: string
  unmatchedA: ReconciliationTransaction[]
  unmatchedB: ReconciliationTransaction[]
}

export function ManualMatchDialog({
  open,
  onClose,
  reconciliationId,
  unmatchedA,
  unmatchedB,
}: ManualMatchDialogProps) {
  const { toast } = useToast()
  const mutation = useManualMatchReconciliation()
  const [selectedA, setSelectedA] = useState<Set<string>>(new Set())
  const [selectedB, setSelectedB] = useState<Set<string>>(new Set())
  const [explanation, setExplanation] = useState('')

  useEffect(() => {
    if (open) {
      setSelectedA(new Set())
      setSelectedB(new Set())
      setExplanation('')
    }
  }, [open])

  const totalA = useMemo(
    () => unmatchedA.filter((t) => selectedA.has(t.id)).reduce((s, t) => s + (t.amount || 0), 0),
    [unmatchedA, selectedA],
  )
  const totalB = useMemo(
    () => unmatchedB.filter((t) => selectedB.has(t.id)).reduce((s, t) => s + (t.amount || 0), 0),
    [unmatchedB, selectedB],
  )
  const variance = Math.abs(Math.abs(totalA) - Math.abs(totalB))

  const canSubmit = selectedA.size > 0 && selectedB.size > 0 && !mutation.isPending

  const handleSubmit = async () => {
    try {
      await mutation.mutateAsync({
        reconciliationId,
        data: {
          sourceAIds: Array.from(selectedA),
          sourceBIds: Array.from(selectedB),
          explanation: explanation.trim() || undefined,
        },
      })
      toast({
        title: 'Manual match created',
        description: `Paired ${selectedA.size} A row(s) with ${selectedB.size} B row(s).`,
      })
      onClose()
    } catch (error) {
      toast({
        title: 'Manual match failed',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Manual match</DialogTitle>
          <DialogDescription>
            Select unmatched transactions from each source to pair into an approved match group.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <UnmatchedColumn
            title="Source A"
            txns={unmatchedA}
            selected={selectedA}
            onToggle={(id) => {
              setSelectedA((prev) => {
                const next = new Set(prev)
                if (next.has(id)) next.delete(id)
                else next.add(id)
                return next
              })
            }}
          />
          <UnmatchedColumn
            title="Source B"
            txns={unmatchedB}
            selected={selectedB}
            onToggle={(id) => {
              setSelectedB((prev) => {
                const next = new Set(prev)
                if (next.has(id)) next.delete(id)
                else next.add(id)
                return next
              })
            }}
          />
        </div>

        <div className="rounded-md border border-border bg-surface-muted/40 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-foreground-muted">Total A</span>
            <span className="tabular-nums font-medium">{formatCurrency(totalA)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-foreground-muted">Total B</span>
            <span className="tabular-nums font-medium">{formatCurrency(totalB)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-foreground-muted">Variance</span>
            <span
              className={
                variance > 0.005
                  ? 'tabular-nums font-semibold text-amber-600'
                  : 'tabular-nums font-semibold text-success'
              }
            >
              {formatCurrency(variance)}
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="manual-match-explanation">Explanation (optional)</Label>
          <Textarea
            id="manual-match-explanation"
            placeholder="Why are these rows being paired?"
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            rows={2}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {mutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
            Pair {selectedA.size}/{selectedB.size}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UnmatchedColumn({
  title,
  txns,
  selected,
  onToggle,
}: {
  title: string
  txns: ReconciliationTransaction[]
  selected: Set<string>
  onToggle: (id: string) => void
}) {
  return (
    <div className="flex max-h-72 flex-col overflow-hidden rounded-lg border border-border">
      <div className="border-b border-border bg-surface-muted px-3 py-2 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
        {title} ({txns.length})
      </div>
      <ul className="flex-1 divide-y divide-border/60 overflow-y-auto">
        {txns.length === 0 && (
          <li className="px-3 py-4 text-center text-xs text-foreground-subtle">
            No unmatched rows.
          </li>
        )}
        {txns.map((t) => (
          <li
            key={t.id}
            className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-surface-muted/50"
            onClick={() => onToggle(t.id)}
          >
            <Checkbox checked={selected.has(t.id)} onCheckedChange={() => onToggle(t.id)} />
            <div className="min-w-0 flex-1">
              <div className="truncate">{t.description || t.id}</div>
              {t.date && <div className="text-xs text-foreground-muted">{t.date}</div>}
            </div>
            <span className="tabular-nums">{formatCurrency(t.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default ManualMatchDialog
