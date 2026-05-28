'use client'

import { useMemo } from 'react'
import { Check, Loader2, Sparkles, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  useApproveReconciliationGroup,
  useRejectReconciliationGroup,
} from '@/hooks/useAnalyticsReconciliation'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/analytics/format'
import type {
  ReconciliationMatchGroup,
  ReconciliationTransaction,
} from '@/lib/analytics/reconciliationTypes'

interface MatchGroupCardProps {
  reconciliationId: string
  group: ReconciliationMatchGroup
  sourceA: ReconciliationTransaction[]
  sourceB: ReconciliationTransaction[]
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  approved: 'default',
  suggested: 'secondary',
  rejected: 'destructive',
  matched: 'default',
}

export function MatchGroupCard({
  reconciliationId,
  group,
  sourceA,
  sourceB,
}: MatchGroupCardProps) {
  const { toast } = useToast()
  const approveMutation = useApproveReconciliationGroup()
  const rejectMutation = useRejectReconciliationGroup()

  const aTxns = useMemo(
    () => (group.sourceAIds ?? []).map((id) => sourceA.find((t) => t.id === id)).filter(Boolean) as ReconciliationTransaction[],
    [group.sourceAIds, sourceA],
  )
  const bTxns = useMemo(
    () => (group.sourceBIds ?? []).map((id) => sourceB.find((t) => t.id === id)).filter(Boolean) as ReconciliationTransaction[],
    [group.sourceBIds, sourceB],
  )

  const variance = Math.abs(Math.abs(group.totalA) - Math.abs(group.totalB))
  const isPending = approveMutation.isPending || rejectMutation.isPending
  const status = String(group.status ?? 'suggested')
  const isFinal = status === 'approved' || status === 'rejected'

  const handleApprove = async () => {
    try {
      await approveMutation.mutateAsync({ reconciliationId, groupId: group.id })
      toast({ title: 'Group approved', description: group.explanation })
    } catch (error) {
      toast({
        title: 'Approval failed',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      })
    }
  }

  const handleReject = async () => {
    try {
      await rejectMutation.mutateAsync({ reconciliationId, groupId: group.id })
      toast({ title: 'Group rejected', description: 'Transactions returned to unmatched.' })
    } catch (error) {
      toast({
        title: 'Reject failed',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{group.type}</Badge>
          <Badge variant={STATUS_VARIANT[status] ?? 'secondary'}>{status}</Badge>
          <span className="inline-flex items-center gap-1 text-xs text-foreground-muted">
            <Sparkles className="size-3" aria-hidden />
            {(group.confidence * 100).toFixed(0)}% confidence
          </span>
        </div>
        {!isFinal && (
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={handleReject} disabled={isPending}>
              {rejectMutation.isPending ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" aria-hidden />
              ) : (
                <X className="mr-1 size-3.5" aria-hidden />
              )}
              Reject
            </Button>
            <Button size="sm" onClick={handleApprove} disabled={isPending}>
              {approveMutation.isPending ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" aria-hidden />
              ) : (
                <Check className="mr-1 size-3.5" aria-hidden />
              )}
              Approve
            </Button>
          </div>
        )}
      </div>

      <p className="mt-2 text-sm text-foreground">{group.explanation}</p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TxnList label="Source A" total={group.totalA} txns={aTxns} />
        <TxnList label="Source B" total={group.totalB} txns={bTxns} />
      </div>

      {variance > 0.005 && (
        <div className="mt-2 text-xs text-amber-600">
          Variance {formatCurrency(variance)} between source totals.
        </div>
      )}
    </div>
  )
}

function TxnList({
  label,
  total,
  txns,
}: {
  label: string
  total: number
  txns: ReconciliationTransaction[]
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface-muted/50 p-3">
      <div className="flex items-center justify-between text-xs font-medium text-foreground-muted">
        <span>{label}</span>
        <span className="tabular-nums text-foreground">{formatCurrency(total)}</span>
      </div>
      <ul className="mt-2 space-y-1 text-xs text-foreground">
        {txns.length === 0 && <li className="text-foreground-subtle">No rows</li>}
        {txns.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">
              {t.date ? <span className="text-foreground-muted">{t.date} · </span> : null}
              {t.description || t.id}
            </span>
            <span className="tabular-nums">{formatCurrency(t.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default MatchGroupCard
