'use client'

/** Rule run history modal — last 50 runs with task link and errors. */
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'
import { formatRelative } from '../../lib/time'
import { getRuleHistory } from '../../lib/rulesEngine'
import { fetchRuleRuns, retryRuleRun, type DurableRuleRun } from '../../lib/ruleRuns'
import { usesTasklyticBackend } from '../../lib/runtimeMode'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import type { Rule } from '../../types'

type Props = {
  rule: Rule | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RuleHistoryModal({ rule, open, onOpenChange }: Props) {
  const { workspaceId } = useWorkspaceContext()
  const [remoteEntries, setRemoteEntries] = useState<DurableRuleRun[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !rule || !workspaceId || !usesTasklyticBackend()) return
    setLoading(true)
    void fetchRuleRuns(workspaceId, rule.id)
      .then(setRemoteEntries)
      .finally(() => setLoading(false))
  }, [open, rule, workspaceId])

  if (!rule) return null
  const localEntries = getRuleHistory(rule.id)
  const entries = usesTasklyticBackend() ? remoteEntries : localEntries

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-sans text-lg">History — {rule.name}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="py-4 text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>Loading run history…</p>
        ) : entries.length === 0 ? (
          <p className="py-4 text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>No runs recorded yet.</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
            {entries.map((e) => (
              <li key={e.id} className="py-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{e.taskName}</span>
                  <span className="shrink-0 text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
                    {formatRelative(e.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
                  {e.actionsApplied.join(', ') || ('status' in e ? e.status : 'No actions')}
                </p>
                {'failure' in e && e.failure ? (
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-xs text-destructive">{e.failure.detail}</p>
                    {e.status === 'failed' ? (
                      <Button size="sm" variant="outline" onClick={async () => {
                        await retryRuleRun(e.id)
                        if (workspaceId) setRemoteEntries(await fetchRuleRuns(workspaceId, rule.id))
                      }}>Retry</Button>
                    ) : null}
                  </div>
                ) : 'error' in e && e.error ? (
                  <p className="mt-1 text-xs text-destructive">{e.error}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
